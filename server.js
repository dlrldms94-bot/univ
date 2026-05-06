const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "stepup2026!";
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    throw new Error("DATABASE_URL 환경변수가 필요합니다.");
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false
});

app.use(express.json({ limit: "2mb" }));
app.use(express.static(__dirname));

async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS applications (
            id BIGSERIAL PRIMARY KEY,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);
}

app.get("/api/health", (req, res) => {
    res.json({ ok: true });
});

app.post("/api/applications", async (req, res) => {
    const payload = req.body || {};
    if (!payload.성명 || !payload.연락처 || !payload.이메일) {
        return res.status(400).json({ message: "필수 값이 누락되었습니다." });
    }

    try {
        await pool.query(
            "INSERT INTO applications(payload) VALUES($1::jsonb)",
            [JSON.stringify(payload)]
        );
        return res.status(201).json({ message: "저장 완료" });
    } catch (error) {
        return res.status(500).json({ message: "서버 저장 중 오류가 발생했습니다." });
    }
});

app.get("/api/applications", async (req, res) => {
    const inputPassword = req.headers["x-admin-password"];
    if (inputPassword !== ADMIN_PASSWORD) {
        return res.status(401).json({ message: "관리자 인증 실패" });
    }

    try {
        const { rows } = await pool.query(
            "SELECT id, payload, created_at FROM applications ORDER BY id DESC"
        );
        const applications = rows.map(row => ({
            id: row.id,
            serverSavedAt: row.created_at,
            ...(row.payload || {})
        }));
        return res.json(applications);
    } catch (error) {
        return res.status(500).json({ message: "데이터 조회 중 오류가 발생했습니다." });
    }
});

initDatabase()
    .then(() => {
        app.listen(PORT, () => {
            console.log("Server running on http://localhost:" + PORT);
        });
    })
    .catch(() => {
        process.exit(1);
    });
