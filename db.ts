import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

console.log(process.env.DATABASE_URL)

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

pool.query("SELECT 1", (err, res) => {
  if (err) {
    console.error("Unable to connect to the database:", err);
  } else {
    console.log("Database connection successful");
  }
});

export const query = async (text: string, params: (string | number)[]) => {
  try {
    const result = await pool.query(text, params);
    return result;
  } catch (error) {
    throw error;
  }
};

export default pool;
