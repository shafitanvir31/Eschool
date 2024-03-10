const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const pg = require("pg");
const ejs = require('ejs');

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// Set the path to the public directory
const publicPath = path.join(__dirname, "public");
app.set('view engine', 'ejs'); // Set EJS as the templating engine
app.set('views', publicPath);

// Serve static files from the 'public' directory
app.use(express.static("public"));

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "quiz",
  password: "hr",
  port: 5432,
});
db.connect();
let users = [];
db.query("SELECT * FROM users", (err, res) => {
  if (err) {
    console.log(err);
  } else {
    users = res.rows;
  }
});

// Example array of user credentials (replace this with your actual user data)
const PORT = 3000;
app.get("/profile/:username", async (req, res) => {
  const username = req.params.username;

  try {
      const query = "SELECT user_name AS username, email FROM users WHERE user_name=$1";
      const results = await db.query(query, [username]);
      if (results.rows.length > 0) {
          const user = results.rows[0];
          res.render('profile', { user }); // Render the 'profile' template with user data
      } else {
          res.status(404).send("User not found");
      }
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "login.html"));
});

app.post("/login", (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  // Check if the provided username and password match any user in the array
  const user = users.find(
    (u) => u.user_name === username && u.password === password
  );

  if (user) {
    // Redirect to the homepage and pass only the username as a parameter
    res.redirect(`/home?username=${user.user_name}`);
  } else {
    // Show an error page with a back button
    res.send('<h1>Invalid username or password</h1><a href="/">Back</a>');
  }
});

app.get("/home", (req, res) => {
  res.sendFile(path.join(publicPath, "homepage.html"));
});

app.get("/categories", async (req, res) => {
  try {
    let query = "SELECT category_id AS id, category_name AS name FROM category";

    // Check if a search query is provided
    if (req.query.searchName) {
      query += " WHERE LOWER(category_name) LIKE LOWER($1)";
      const searchName = `%${req.query.searchName.toLowerCase()}%`;
      const results = await db.query(query, [searchName]);
      res.json(results.rows);
    } else {
      const results = await db.query(query);
      res.json(results.rows);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/subcategories/:categoryId", async (req, res) => {
  const categoryId = req.params.categoryId;
  const searchName = req.query.searchName; // Extract search query from request

  try {
    let query =
      "SELECT subcategory_id AS id, subcategory_name AS name FROM subcategory WHERE category_id = $1";
    const params = [categoryId];

    // Check if a search query is provided
    if (searchName) {
      query += " AND LOWER(subcategory_name) LIKE LOWER($2)"; // Modify query to include search condition
      params.push(`%${searchName.toLowerCase()}%`); // Add search parameter to query parameters
    }

    const results = await db.query(query, params);
    res.json(results.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/quizzes/:subcategoryId", async (req, res) => {
  const subcategoryId = req.params.subcategoryId;
  try {
    const query =
      "SELECT quiz_id As id,title as name FROM quizs WHERE subcategory_id = $1";
    const results = await db.query(query, [subcategoryId]);
    res.json(results.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.get('/questions/:quizId', async (req, res) => {
  const quizId = req.params.quizId;
  console.log(quizId);
  try {
      const query =
          "SELECT A.question_id,question_text, option1, option2, option3, option4, corrected_option AS correct_answer FROM quiz_question A JOIN question B ON A.question_id=B.question_id WHERE quiz_id = $1";
      const results = await db.query(query, [quizId]);
      res.render('question', { questions: results.rows });
  } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
  }
});


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// app.get('/home',(req,res)=>{

// });

// app.get("/home", (req, res) => {
//   const query = "SELECT * FROM CATEGORY";
//   db.query(query, (err, result) => {
//     if (err) {
//       console.log(err);
//       res.status(500).json({ error: "Internal Server Error" });
//     } else {
//       // Send JSON response with the list of categories
//       res.json({ categories: result.rows });
//     }
//   });
// });

// //selection of category id and showing the subcategories
// app.post("/home", (req, res) => {
//   const categoryid = req.body.categoryid;
//   const query = "SELECT subcategory_name FROM subcategory WHERE category_id = $1"; // Using a parameterized query

//   // Pass the actual values as an array
//   db.query(query, [categoryid], (err, result) => {
//     if (err) {
//       console.log(err);
//       res.status(500).json({ error: "Internal Server Error" });
//     } else {
//       // Send JSON response with the list of quizzes
//       res.json({ subcategory: result.rows });
//     }
//   });
// });
// Assuming you have set up express and database connection as mentioned previously
//showing the list of quizes for a particular subcategory
// app.post("/category", (req, res) => {
//   const subcategoryid = req.body.subcategoryid;
//   const query = "SELECT title FROM quizs q join subcategory s on q.subcategory_id=s.subcategory_id WHERE q.subcategory_id = $1"; // Using a parameterized query

//   // Pass the actual values as an array
//   db.query(query, [subcategoryid], (err, result) => {
//     if (err) {
//       console.log(err);
//       res.status(500).json({ error: "Internal Server Error" });
//     } else {
//       // Send JSON response with the list of quizzes
//       res.json({ quiz: result.rows });
//     }
//   });
// });

// //showing the questions of a specific quiz id
// app.post("/quiz", (req, res) => {
//   const quizid = req.body.quizid;
//   const query =
//     "SELECT question_text,option1,option2,option3,option4 FROM quiz_question A join question B on A.question_id=B.question_id WHERE quiz_id = $1"; // Using a parameterized query
//   db.query(query, [quizid], (err, result) => {
//     if (err) {
//       console.log(err);
//       res.status(500).json({ error: "Internal Server Error" });
//     } else {
//       // Send JSON response with the list of quizzes
//       res.json({ quizs: result.rows });
//     }
//   });
// });

// //searching by caterory name
// app.post("/search", (req, res) => {
//   const searchname = req.body.searchname;
//   const query =
//     "SELECT category_name FROM quizs q JOIN category c ON q.category_id = c.category_id WHERE LOWER(category_name) LIKE LOWER($1)";

//   // Pass the actual values as an array
//   db.query(query, [`%${searchname.toLowerCase()}%`], (err, result) => {
//     if (err) {
//       console.log(err);
//       res.status(500).json({ error: "Internal Server Error" });
//     } else {
//       // Send JSON response with the list of categories
//       res.json({ categories: result.rows });
//     }
//   });
// });

// app.get("/questionbank", (req, res) => {
//   res.sendFile(path.join(publicPath, "quesadd.html"));
// });

// app.post("/addquestion", (req, res) => {
//   const question = req.body.question;
//   const option1 = req.body.option1;
//   const option2 = req.body.option2;
//   const option3 = req.body.option3;
//   const option4 = req.body.option4;
//   const answer = req.body.answer;

//   const query =
//     "INSERT INTO questions (question_id, option1, option2, option3, option4, corrected_option) VALUES ($1, $2, $3, $4, $5, $6)";
//   const values = [question, option1, option2, option3, option4, answer];

//   db.query(query, values, (err, result) => {
//     if (err) {
//       console.error(err);
//       // Handle the error appropriately, such as sending an error response to the client
//       res.status(500).send("Internal Server Error");
//     } else {
//       req.send("<h1>Question added successfully</h1>");
//       // Redirect the client to the question bank page
//       //res.redirect('/questionbank');
//     }
//   });
// });
app.get("/userranking", (req, res) => {
  const userId =
  const query = `
  SELECT CATEGORY_NAME, COUNT(*) + 1 AS RANK
  FROM ATTEMPT A
    JOIN QUIZS Q ON A.QUIZ_ID = Q.QUIZ_ID
    JOIN CATEGORY C ON Q.CATEGORY_ID = C.CATEGORY_ID
  WHERE USER_ID = $1
    AND A.SCORE >= (
      SELECT MAX(SCORE)
      FROM ATTEMPT A2
        JOIN QUIZS Q2 ON A2.QUIZ_ID = Q2.QUIZ_ID
      WHERE A2.USER_ID = $1
        AND Q2.CATEGORY_ID = Q.CATEGORY_ID
    )
  GROUP BY CATEGORY_NAME
  ORDER BY RANK ASC`;
  const values = [userid];
  db.query(query, values, (err, result) => {
    if (err) {
      console.log(err);
      res.status(500).json({ error: "Internal Server Error" });
    } else {
      // Send JSON response with the list of categories
      res.json({ RESULTS: result.rows });
    }
  });
});
// // Fetch quiz rankings for a specific category
// // Fetch quiz rankings for a specific category
// app.post("/categoryranking", (req, res) => {
//   const categoryId = req.body.categoryId;
//   const query = `
//     SELECT u.user_name, a.score
//     FROM attempt a
//     JOIN users u ON a.user_id = u.user_id
//     JOIN quizs q ON a.quiz_id = q.quiz_id
//     WHERE q.category_id = $1
//     ORDER BY a.score DESC;
//   `;

//   db.query(query, [categoryId], (err, result) => {
//     if (err) {
//       console.error(err);
//       res.status(500).json({ error: "Internal Server Error" });
//     } else {
//       res.json({ rankings: result.rows });
//     }
//   });
// });
// //new code
// app.get("/subcategories/:categoryId", async (req, res) => {
//   const categoryId = req.params.categoryId;
//   try {
//       const query = 'SELECT * FROM subcategories WHERE category_id = $1';
//       const results = await db.query(query, [categoryId]);
//       res.json(results.rows);
//   } catch (err) {
//       console.error(err);
//       res.status(500).json({error: 'Internal server error'});
//   }
// });
// app.get("/quizzes/:subcategoryId", async (req, res) => {
//   const subcategoryId = req.params.subcategoryId;
//   try {
//       const query = 'SELECT * FROM quizzes WHERE subcategory_id = $1';
//       const results = await db.query(query, [subcategoryId]);
//       res.json(results.rows);
//   } catch (err) {
//       console.error(err);
//       res.status(500).json({error: 'Internal server error'});
//   }
// });

// app.listen(PORT, () => {
//   console.log(`Server is running on port ${PORT}`);
// });
