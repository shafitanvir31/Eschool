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
