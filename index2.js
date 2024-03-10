const express = require("express");
const session = require("express-session");
const path = require("path");
const bodyParser = require("body-parser");
const pg = require("pg");
const ejs = require("ejs");
const bcrypt = require("bcrypt");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));

// Set up session middleware
app.use(
  session({
    secret: "secret", // Change this to a random string
    resave: false,
    saveUninitialized: true,
  })
);
app.use(bodyParser.json());
app.use(express.static("public"));

// Set the path to the public directory
const publicPath = path.join(__dirname, "public");
app.set("view engine", "ejs"); // Set EJS as the templating engine
app.set("views", publicPath);

// Serve static files from the 'public' directory

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "quiz",
  password: "hr",
  port: 5432,
});
let users = [];
let article_modifiers = [];
let question_modifiers = [];
let categories = [];
let subcategories = [];
let subscription_plans = [];
db.connect((err) => {
  if (err) {
    console.error("Error connecting to database:", err);
    return;
  }
  console.log("Connected to database");
  // Fetch users
  db.query("select * from category", (err, result) => {
    //actegory  table read
    if (err) {
      console.error("Error fetching categories:", err);
    } else {
      categories = result.rows;
    }
  });
  db.query("select * from subcategory", (err, result) => {
    if (err) {
      console.error("Error fetching subcategories:", err);
    } else {
      subcategories = result.rows;
    }
  });
  db.query("SELECT * FROM users", (err, result) => {
    if (err) {
      console.error("Error fetching users:", err);
    } else {
      users = result.rows;
      //console.log('Users:', users);
    }
  });
  // Fetch article modifiers
  db.query("SELECT * FROM article_modifier", (err, result) => {
    if (err) {
      console.error("Error fetching article modifiers:", err);
    } else {
      article_modifiers = result.rows;
      //console.log('Article modifiers:', article_modifiers);
    }
  });
  // Fetch question modifiers
  db.query("SELECT * FROM question_modifier", (err, result) => {
    if (err) {
      console.error("Error fetching question modifiers:", err);
    } else {
      question_modifiers = result.rows;
      //onsole.log('Question modifiers:', question_modifiers);
    }
  });
  db.query("select * from subscription_plan", (err, result) => {
    if (err) {
      console.error("Error fetching subscriptions:", err);
    } else {
      subscription_plans = result.rows;
    }
  }); //subscription table read

  updatePremiumStatus();
});
const PORT = 3000;
// Middleware to check if user is logged in
const requireLogin = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).send("Unauthorized");
  }
  next();
};
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "login.html"));
});

app.get("/profile/:username", requireLogin, async (req, res) => {
  const username = req.params.username;

  try {
    const query =
      "SELECT user_name AS username, email FROM users WHERE user_name=$1";
    const results = await db.query(query, [username]);

    if (results.rows.length > 0) {
      const user = results.rows[0];

      const query2 = `SELECT CATEGORY_NAME, COUNT(*)+1 AS RANK FROM ATTEMPT A JOIN QUIZS Q ON A.QUIZ_ID = Q.QUIZ_ID JOIN CATEGORY C ON Q.CATEGORY_ID = C.CATEGORY_ID
        WHERE A.SCORE > (
          SELECT Max(score)
          FROM ATTEMPT A2
          JOIN QUIZS Q2 ON A2.QUIZ_ID = Q2.QUIZ_ID
          WHERE A2.USER_ID = $1
            AND Q2.CATEGORY_ID = Q.CATEGORY_ID
        ) and a.user_id<>$1
        GROUP BY CATEGORY_NAME
        ORDER BY RANK ASC`;

      const values = [req.session.userId];
      const result = await db.query(query2, values);
      const query3="select end_date from subscription where user_id=$1";
      const result3 = await db.query(query3, values);
      const end_date = result3.rows[0].end_date;
      res.render("profile", { user, RESULTS: result.rows, end_date });
    } else {
      res.status(404).send("User not found");
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/home", (req, res) => {
  res.sendFile(path.join(publicPath, "homepage.html"));
});
app.get("/home2", (req, res) => {
  res.sendFile(path.join(publicPath, "articleHomepage.html"));
});

app.post("/login", (req, res) => {
  const username = req.body.username;
  const password = req.body.password;

  // Check if the provided username and password match any user in the array
  const user = users.find(
    (u) => u.user_name === username && u.password === password
  );

  if (user) {
    // Store user ID in session upon successful login
    req.session.userId = user.user_id;
    //res.redirect(`/home?username=${username}`);
    res.redirect(`/choice?username=${username}`);
  } else {
    // Show an error page with a back button
    res.send('<h1>Invalid username or password</h1><a href="/">Back</a>');
  }
});
// Define the '/choice' route to render the choice.ejs file
app.get("/choice", (req, res) => {
  const userId = req.session.userId;
  const queryQuestionModifier =
    "SELECT * FROM question_modifier WHERE user_id = $1";
  const queryArticleModifier =
    "SELECT * FROM article_modifier WHERE user_id = $1";
  const values = [userId];
  const username = req.query.username;

  // Check question modifier
  db.query(queryQuestionModifier, values, (err, questionResult) => {
    if (err) {
      console.error("Error fetching question modifier data:", err);
      res.status(500).send("Internal Server Error");
      return;
    }
    const questionModifier = questionResult.rows.length > 0;
    console.log(questionModifier);

    // Check article modifier
    db.query(queryArticleModifier, values, (err, articleResult) => {
      if (err) {
        console.error("Error fetching article modifier data:", err);
        res.status(500).send("Internal Server Error");
        return;
      }
      const articleModifier = articleResult.rows.length > 0;
      console.log(articleModifier);

      res.render("choice", { username, questionModifier, articleModifier });
    });
  });
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
app.get("/articles/:subcategoryId", async (req, res) => {
  const subcategoryId = req.params.subcategoryId;
  const categoryId = req.query.categoryId;

  try {
    const query =
      "SELECT article_id AS id, article_title AS title FROM article WHERE subcategory_id = $1 AND category_id = $2";
    const results = await db.query(query, [subcategoryId, categoryId]);
    res.json(results.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/questions/:quizId", requireLogin, async (req, res) => {
  const quizId = req.params.quizId;
  const userId = req.session.userId;
  const categoryId = req.query.categoryId;
  console.log(categoryId);
  console.log("quiz_id" + quizId); // Retrieve user ID from session

  try {
    const query =
      "SELECT A.question_id,question_text, option1, option2, option3, option4, corrected_option AS correct_answer FROM quiz_question A JOIN question B ON A.question_id=B.question_id WHERE quiz_id = $1";
    const results = await db.query(query, [quizId]);
    res.render("question", {
      questions: results.rows,
      userId: userId,
      categoryId: categoryId,
      quizId: quizId,
    }); // Render the 'question' template with question data
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});
app.get(
  "/customquiz/:categoryId/:subcategoryId",
  requireLogin,
  async (req, res) => {
    const categoryId = req.params.categoryId;
    const subcategoryId = req.params.subcategoryId;
    const numQuestions = req.query.numQuestions;
    const userId = req.session.userId;
    console.log(categoryId);
    console.log(subcategoryId);
    console.log(numQuestions);
    console.log(userId);

    try {
      // Your database query to fetch questions based on categoryId, subcategoryId, and numQuestions
      const query = `
      SELECT question_id, question_text, option1, option2, option3, option4, corrected_option AS correct_answer 
      FROM question
      WHERE category_id = $1 AND subcategory_id = $2
      ORDER BY random()
      LIMIT $3
    `;
      const results = await db.query(query, [
        categoryId,
        subcategoryId,
        numQuestions,
      ]);
      console.log(results.rows);

      res.render("question", {
        questions: results.rows,
        userId: userId,
        categoryId: categoryId,
        subcategoryId: subcategoryId,
        quizId: 100,
      }); // Render the 'customquiz' template with question data
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Internal server error" });
    }
  }
);
app.get("/article/:articleId", requireLogin, async (req, res) => {
  const articleId = req.params.articleId;
  const userId = req.session.userId;
  const categoryId = req.query.categoryId;
  var subcategory_id;

  try {
    // Fetch article details based on articleId
    const query = "SELECT * FROM article WHERE article_id = $1";
    const results = await db.query(query, [articleId]);
    const article = results.rows[0];
    subcategory_id = article.subcategory_id;

    // Fetch quizzes based on subcategory_id
    const query2 =
      "SELECT quiz_id As id,title as name FROM quizs WHERE subcategory_id = $1";
    const results2 = await db.query(query2, [subcategory_id]);

    // Check if the user is premium
    const query3 = "SELECT is_premium FROM users WHERE user_id = $1";
    const results3 = await db.query(query3, [userId]);
    const user = results3.rows[0];
    const is_premium = user ? user.is_premium : false;
    console.log(userId + " is " + is_premium);
    console.log(article.premium_status);

    // Check premium_status and user's premium status
    if (article.premium_status && !is_premium) {
      // If premium_status is true and user is not premium, redirect to /home3
      return res.redirect("/home3");
    } else {
      const query4 =
        "SELECT * FROM user_read_articles WHERE user_id = $1 AND article_id = $2";
      const results4 = await db.query(query4, [userId, articleId]);
      if (results4.rows.length === 0) {
        let query5 =
          "INSERT INTO user_read_articles (user_id, article_id, view_counter, last_view_date) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)";
        await db.query(query5, [userId, articleId, 1]);
      } else {
        let numread= results4.rows[0].view_counter;
        numread++;
        let query5 =
          "UPDATE user_read_articles SET view_counter = $1, last_view_date = CURRENT_TIMESTAMP WHERE user_id = $2 AND article_id = $3";
        await db.query(query5, [numread, userId, articleId]);
      }
      // Render the article template
      res.render("article", {
        quizs: results2.rows,
        articleTitle: article.article_title,
        articleContent: article.article_content,
        userId: userId,
        categoryId: categoryId,
        subcategory_id: article.subcategory_id,
        premium_status: article.premium_status,
      });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});


app.post("/submit-quiz-attempt", requireLogin, async (req, res) => {
  console.log("I am here");
  const userId = req.session.userId;

  let attempt_id = 0;
  try {
    const query = "SELECT MAX(attempt_id) AS max_attempt_id FROM attempt";
    const results = await db.query(query);
    attempt_id = results.rows[0].max_attempt_id;
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
  attempt_id++;
  const { score, attempt_date, quiz_id, submittedAnswers } = req.body;
  console.log(score);
  console.log(userId);
  console.log(attempt_date);
  console.log(quiz_id);
  try {
    const insertQuery = `
          INSERT INTO attempt(attempt_id, score, user_id, attempt_date, quiz_id)
          VALUES($1, $2, $3, $4, $5)
      `;
    await db.query(insertQuery, [
      attempt_id,
      score,
      userId,
      attempt_date,
      quiz_id,
    ]);
    // Insert submitted answers into the database named user_answers which has field user_id,question_id,submitted_answer,user_answer_option
    for (let i = 0; i < submittedAnswers.length; i++) {
      const insertQuery2 = `
            INSERT INTO user_answers(question_id,user_answer_option,user_id,attempt_id)
            VALUES($1, $2, $3, $4)
        `;
      await db.query(insertQuery2, [
        submittedAnswers[i].id,
        submittedAnswers[i].submittedAnswer,
        userId,
        attempt_id,
      ]);
    }
    res.json({ message: "Quiz attempt submitted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Route to fetch category rankings
app.get("/categoryranking", (req, res) => {
  db.query(
    "SELECT q.user_id, q.user_rank, c.category_name FROM quiz_rank q INNER JOIN category c ON q.category_id = c.category_id",
    (err, result) => {
      if (err) {
        console.error("Error fetching data:", err);
        res.status(500).send("Internal Server Error");
        return;
      }

      const categoryRankings = {};
      result.rows.forEach((row) => {
        if (!categoryRankings[row.category_name]) {
          categoryRankings[row.category_name] = [];
        }
        categoryRankings[row.category_name].push({
          user_id: row.user_id,
          rank: row.user_rank,
        });
      });

      res.render("categoryranking", { categoryRankings });
    }
  );
});
//make a signup page
app.get("/signup", (req, res) => {
  res.render("signup");
});

// Route to handle signup form submission
app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    //find maximum user_id from the users table
    const query1 = "SELECT MAX(user_id) AS max_user_id FROM users";
    const results = await db.query(query1);
    const user_id = results.rows[0].max_user_id + 1;

    // Insert the user into the database
    const query =
      "INSERT INTO users (user_id, user_name, email, password, registration_date) VALUES ($1, $2, $3, $4, $5)";
    await db.query(query, [
      user_id,
      username,
      email,
      hashedPassword,
      new Date(),
    ]);

    res.redirect("/"); // Redirect to login page after signup
  } catch (error) {
    console.error("Error signing up:", error);

    if (error.code === "23505") {
      // Unique violation error code for duplicate key constraint violation
      res.status(400).send("Email already exists.");
    } else if (error.message.includes("Invalid email format")) {
      res.status(400).send("Invalid email format.");
    } else {
      res.status(500).send("Internal Server Error");
    }
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return console.log(err);
    }
    res.redirect("/");
  });
});
// Define the route to render the questionadd.ejs file
app.get("/questionadd", (req, res) => {
  res.render("questionadd");
});

// Define the route to handle form submission and add question to database
app.post("/addQuestion", (req, res) => {
  const {
    questionText,
    option1,
    option2,
    option3,
    option4,
    correctOption,
    categoryId,
    subcategoryId,
  } = req.body;
  const userId = req.session.userId;
  // add to question table
  const query1 = "SELECT MAX(question_id) AS max_question_id FROM question";
  db.query(query1, (err, result) => {
    if (err) {
      console.error("Error fetching data:", err);
      res.status(500).send("Internal Server Error");
      return;
    }
    const question_id = result.rows[0].max_question_id + 1;
    const query2 =
      "INSERT INTO question (question_id, question_text, option1, option2, option3, option4, corrected_option, category_id, subcategory_id,question_provider_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)";
    db.query(
      query2,
      [
        question_id,
        questionText,
        option1,
        option2,
        option3,
        option4,
        correctOption,
        categoryId,
        subcategoryId,
        userId,
      ],
      (err, result) => {
        if (err) {
          console.error("Error fetching data:", err);
          res.status(500).send("Internal Server Error");
          return;
        }
        res.status(200).send("Question added successfully");
      }
    );
  });
});

// Define route to render the article add page
app.get("/articleadd", async (req, res) => {
  try {
    res.render("articleadd.ejs"); // Assuming you have a view engine set up that supports EJS
  } catch (err) {
    console.error(err);
    res.status(500).send("Internal server error");
  }
});

// Define the route to handle form submission and add article to database
app.post("/addArticle", (req, res) => {
  const { articleTitle, articleContent, category, subcategory } = req.body;
  const userId = req.session.userId;
  var article_id;
  //find max article id from article table
  const query1 = "SELECT MAX(article_id) AS max_article_id FROM article";
  db.query(query1, (err, result) => {
    if (err) {
      console.error("Error fetching data:", err);
      res.status(500).send("Internal Server Error");
      return;
    }
    article_id = result.rows[0].max_article_id + 1;

    const query =
      "INSERT INTO article (article_title, article_content, category_id, subcategory_id,article_id,author_id) VALUES ($1, $2, $3, $4,$5,$6)";
    db.query(
      query,
      [articleTitle, articleContent, category, subcategory, article_id, userId],
      (err, result) => {
        if (err) {
          console.error("Error adding article:", err);
          res.status(500).send("Internal Server Error");
          return;
        }
        res.status(200).send("Article added successfully");
      }
    );
  });
});
app.post("/update/email", requireLogin, async (req, res) => {
  const newEmail = req.body.newEmail;
  // Update the email in the database for the logged-in user
  try {
    await db.query("UPDATE users SET email = $1 WHERE user_id = $2", [
      newEmail,
      req.session.userId,
    ]);
    res.redirect("/profile/" + req.session.username);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// POST route to update password
app.post("/update/password", requireLogin, async (req, res) => {
  const newPassword = req.body.newPassword;
  // Update the password in the database for the logged-in user
  try {
    await db.query("UPDATE users SET password = $1 WHERE user_id = $2", [
      newPassword,
      req.session.userId,
    ]);
    res.redirect("/profile/" + req.session.username);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.get("/home3", (req, res) => {
  console.log("in home3");
  console.log(req.session.userId, " in home3");
  console.log(subscription_plans);
  res.render("subscriptionhomepage", { subscription_plans });

  //res.sendFile(path.join(publicPath, "subscriptionhomepage.html"));
});

async function updatePremiumStatus() {
  try {
    // Get current date
    const currentDate = new Date();

    // Query subscriptions with end dates in the past
    const query = `
      UPDATE "public"."users"
      SET "is_premium" = false
      WHERE "user_id" IN (
        SELECT "user_id" 
        FROM "public"."subscription" 
        WHERE "end_date" < $1
      )
    `;

    const values = [currentDate];

    // Execute the update query
    const result = await db.query(query, values);
    console.log("Premium status updated successfully");
  } catch (error) {
    console.error("Error updating premium status:", error);
    // Handle error
  }
}

// Call the function to update premium status
async function fetchTotalRevenue() {
  const query = "SELECT SUM(S2.monthly_cost) FROM subscription S1 JOIN subscription_plan S2 ON S1.plan_ID=S2.plan_id";
  try {
    const result = await db.query(query);
    return result.rows[0].sum;
  } catch (error) {
    console.error("Error:", error);
    return null; // or handle the error appropriately
  }
}

async function fetchTotalArticles() {
  const result = await db.query('SELECT COUNT(*) FROM article');
  return result.rows[0].count;
}

async function fetchTotalQuizzes() {
  const result = await db.query('SELECT COUNT(*) FROM quizs');
  return result.rows[0].count;
}

async function fetchTotalUsers() {
  const result = await db.query('SELECT COUNT(*) FROM users');
  return result.rows[0].count;
}

async function fetchArticleReadingData() {
  const result = await db.query('SELECT article_id, SUM(view_counter) FROM user_read_articles GROUP BY article_id');
  return result.rows;
}


// Route to handle GET requests to /statistics
app.get('/statistics', async (req, res) => {
  try {
    // Fetch required data from the database
    const totalArticles = await fetchTotalArticles();
    const totalQuizzes = await fetchTotalQuizzes();
    const totalUsers = await fetchTotalUsers();
    const articleReadingData = await fetchArticleReadingData();

    // Fetch total revenue
    const totalRevenue = await fetchTotalRevenue();

    // Render statistics page with fetched data
    res.render('statistics', {
      totalRevenue,
      totalArticles,
      totalQuizzes,
      totalUsers,
      articleReadingData
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('Internal Server Error');
  }
});



async function updatePremiumStatus() {
  try {
    // Get current date
    const currentDate = new Date();

    // Query subscriptions with end dates in the past
    const query = `
      UPDATE "public"."users"
      SET "is_premium" = false
      WHERE "user_id" IN (
        SELECT "user_id" 
        FROM "public"."subscription" 
        WHERE "end_date" < $1
      )
    `;

    const values = [currentDate];

    // Execute the update query
    const result = await db.query(query, values);
    console.log("Premium status updated successfully");
  } catch (error) {
    console.error("Error updating premium status:", error);
    // Handle error
  }
}

// Call the function to update premium status



app.post("/buySubscription", async (req, res) => {
  const plan_id = req.body.plan_id;
  const currentDate = new Date();
  const userId = req.session.userId;
  let dueTime;
  let old_end_date;


  try {
    const result = await new Promise((resolve, reject) => {
      const query = "SELECT duration FROM subscription_plan WHERE plan_id = $1";
      db.query(query, [plan_id], (err, result) => {
        if (err) {
          console.error("Error fetching due time:", err);
          reject(err);
        } else {
          resolve(result);
        }
      });
    });

    if (result.rows.length > 0) {
      dueTime = result.rows[0].duration;
      console.log("Due time:", dueTime);
    } else {
      console.error("Plan not found");
      // Handle case where plan is not found
    }
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send("Internal Server Error");
  }

  console.log("Due time:", dueTime);

  try {
    const result = await new Promise((resolve, reject) => {
      db.query(
        "SELECT end_date FROM subscription WHERE user_id = $1",
        [userId],
        (err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        }
      );
    });

    let maxEndDate = null;

    if (result.rows.length > 0) {
      for (let i = 0; i < result.rows.length; i++) {
        const endDate = result.rows[i].end_date;
        if (!maxEndDate || endDate > maxEndDate) {
          maxEndDate = endDate;
        }
      }
      console.log("Max end date:", maxEndDate);
      old_end_date = maxEndDate;
    }
  } catch (error) {
    console.error("Error fetching data:", error);
    res.status(500).send("Internal Server Error");
  }

  console.log("old_end_date: in here", old_end_date);

  if (old_end_date > currentDate) {
      const endDate = new Date(old_end_date);
      console.log("End date: in here inside if", endDate);
      const hours = endDate.getHours();
      const minutes = endDate.getMinutes();
      const seconds = endDate.getSeconds();
      const milliseconds = endDate.getMilliseconds();
      // Create a new date by adding months
      endDate.setMonth(endDate.getMonth() + dueTime);

      // Set back the time components
      endDate.setHours(hours);
      endDate.setMinutes(minutes);
      endDate.setSeconds(seconds);
      endDate.setMilliseconds(milliseconds);

      console.log("End date:", endDate);
      //const query = UPDATE subscription SET end_date = $1 WHERE user_id = $2;
      const query = `UPDATE subscription SET end_date = $1 WHERE user_id = $2
      `;

      const values = [endDate, userId];
      db.query(query, values, (err, result) => {
      if (err) {
        console.error("Error updating data:", err);
        res.status(500).send("Internal Server Error");
        return;
      }
      console.log("Data updated successfully");
      res.sendStatus(200);
    });
  } else {
      console.log("Current date:", currentDate);
      console.log(plan_id, currentDate, userId, dueTime);

      const hours = currentDate.getHours();
      const minutes = currentDate.getMinutes();
      const seconds = currentDate.getSeconds();
      const milliseconds = currentDate.getMilliseconds();

      // Create a new date by adding months
      const endDate = new Date(currentDate);
      endDate.setMonth(currentDate.getMonth() + dueTime);

      // Set back the time components
      endDate.setHours(hours);
      endDate.setMinutes(minutes);
      endDate.setSeconds(seconds);
      endDate.setMilliseconds(milliseconds);

      console.log("End date:", endDate);

      // Set back the time components
      endDate.setHours(hours);
      endDate.setMinutes(minutes);
      endDate.setSeconds(seconds);
      endDate.setMilliseconds(milliseconds);

      console.log("End date:", endDate);

      const query = `
        INSERT INTO "public"."subscription" ("plan_id", "start_date", "end_date", "status","user_id")
        VALUES ($1, $2, $3, $4,$5)
      `;

      const values = [plan_id, currentDate, endDate, "active", userId];

      db.query(query, values, (err, res) => {
        if (err) {
          console.error("Error inserting data:", err);
          return;
        }
        console.log("Data inserted successfully");
      });

      // Update the database with the selected plan_id
      // Example:
      // await db.query('UPDATE subscriptions SET status = "Active" WHERE plan_id = ?', [plan_id]);

      res.sendStatus(200); // Dummy response for demonstration
    } 
  }
);


app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
