import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config();

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
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
