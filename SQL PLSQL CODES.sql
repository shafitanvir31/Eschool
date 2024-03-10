---------------------------------1--------------------------------------
CREATE OR REPLACE PROCEDURE F() AS
$$
DECLARE
    user_record RECORD;
    category_rank RECORD;
BEGIN
    FOR user_record IN SELECT * FROM USERS LOOP
            FOR category_rank IN 
            SELECT CATEGORY_NAME, C.CATEGORY_ID, user_record.USER_ID, COUNT(*) + 1 AS RANK
            FROM ATTEMPT A
            JOIN QUIZS Q ON A.QUIZ_ID = Q.QUIZ_ID
            JOIN CATEGORY C ON Q.CATEGORY_ID = C.CATEGORY_ID
            WHERE A.USER_ID <> user_record.USER_ID
            AND A.SCORE > (
                SELECT COALESCE(MAX(SCORE), 1000)
                FROM ATTEMPT A2
                JOIN QUIZS Q2 ON A2.QUIZ_ID = Q2.QUIZ_ID
                WHERE A2.USER_ID = user_record.USER_ID
                AND Q2.CATEGORY_ID = Q.CATEGORY_ID
            )
            GROUP BY CATEGORY_NAME, C.category_id, user_record.USER_ID
            ORDER BY CATEGORY_NAME, RANK ASC
        LOOP
            -- Insert into quiz_rank table
						            RAISE NOTICE 'Inserting into quiz_rank: Category_ID=%, User_ID=%, Rank=%', category_rank.CATEGORY_ID, category_rank.USER_ID, category_rank.RANK;

           INSERT INTO quiz_rank (category_id, user_id, user_rank) 
           VALUES (category_rank.CATEGORY_ID, category_rank.USER_ID, category_rank.RANK);
        END LOOP;
    END LOOP;
END;
$$
LANGUAGE plpgsql;

CALL F();




---------------------------2------------------------------------------
CREATE OR REPLACE FUNCTION ranking_update_function() RETURNS TRIGGER AS $$
DECLARE
    v_user_id attempt.user_id%TYPE;
    v_score attempt.score%TYPE;
    v_quiz_id attempt.quiz_id%TYPE;
    flag INTEGER;
    ran INTEGER;
    v_category_id INTEGER;
BEGIN
    flag := 0;
    v_user_id := NEW.user_id;
    v_score := NEW.score;
    v_quiz_id := NEW.quiz_id;

    -- Find if that user already exists in that category
    SELECT COUNT(*) INTO flag
    FROM quiz_rank q1
    JOIN quizs q ON q1.category_id = q.category_id
    WHERE user_id = v_user_id;

    SELECT category_id INTO v_category_id
    FROM quizs
    WHERE quiz_id = v_quiz_id;
		
		
    SELECT COUNT(*) + 1 INTO ran
    FROM attempt a
    JOIN quizs q ON a.quiz_id = q.quiz_id
    JOIN category c ON q.category_id = c.category_id
    WHERE a.score > (
            SELECT COALESCE(MAX(SCORE), 1000)
            FROM attempt a2
            JOIN quizs q2 ON a2.quiz_id = q2.quiz_id
            WHERE a2.user_id = v_user_id
            AND q2.category_id = v_category_id
        )
    AND a.user_id <> v_user_id
    AND c.category_id = v_category_id
    GROUP BY c.category_id;

    -- If flag is greater than 0, update the user's rank
    IF flag > 0 THEN
        UPDATE quiz_rank SET user_rank = ran WHERE user_id = v_user_id AND category_id = v_category_id;
    -- If flag is 0, insert a new row with the user's rank
    ELSIF flag = 0 THEN
        INSERT INTO quiz_rank VALUES (v_user_id, ran, v_category_id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ranking_update
BEFORE INSERT ON attempt
FOR EACH ROW
EXECUTE FUNCTION ranking_update_function();








---------------------------3------------------------------------------
CREATE OR REPLACE FUNCTION check_user_insert() RETURNS TRIGGER AS $$
BEGIN
    -- Check if the email format is valid
    IF NEW.email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$' THEN
        RAISE EXCEPTION 'Invalid email format: %', NEW.email;
    END IF;

    -- Check if the email already exists
    IF EXISTS (SELECT 1 FROM users WHERE email = NEW.email) THEN
        RAISE EXCEPTION 'Email already exists: %', NEW.email;
    END IF;

    -- Check if the username already exists
    IF EXISTS (SELECT 1 FROM users WHERE user_name = NEW.user_name) THEN
        RAISE EXCEPTION 'Username already exists: %', NEW.user_name;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER before_insert_user
BEFORE INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION check_user_insert();



---------------------------4------------------------------------------
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










