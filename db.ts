import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

console.log(process.env.DATABASE_URL);

let pool: Pool;

function getConnection() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
    return pool;
  } else {
    return pool;
  }
}

export const query = async (text: string, params: (string | number)[]) => {
  try {
    const result = await getConnection().query(text, params);
    return result;
  } catch (error) {
    throw error;
  }
};
