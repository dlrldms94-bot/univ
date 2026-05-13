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

function normalizePhone(value) {
    return String(value || "").replace(/\D/g, "");
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function normalizeName(value) {
    return String(value || "").trim();
}

async function initDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS applications (
            id BIGSERIAL PRIMARY KEY,
            payload JSONB NOT NULL,
            applicant_name TEXT,
            applicant_phone TEXT,
            applicant_email TEXT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS applicant_name TEXT
    `);
    await pool.query(`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS applicant_phone TEXT
    `);
    await pool.query(`
        ALTER TABLE applications
        ADD COLUMN IF NOT EXISTS applicant_email TEXT
    `);

    await pool.query(`
        UPDATE applications
        SET
            applicant_name = BTRIM(COALESCE(payload->>'성명', '')),
            applicant_phone = REGEXP_REPLACE(COALESCE(payload->>'연락처', ''), '\\D', '', 'g'),
            applicant_email = LOWER(BTRIM(COALESCE(payload->>'이메일', '')))
        WHERE
            applicant_name IS NULL
            OR applicant_phone IS NULL
            OR applicant_email IS NULL
    `);

    await pool.query(`
        WITH ranked AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY applicant_phone, applicant_email
                    ORDER BY id DESC
                ) AS rn
            FROM applications
            WHERE applicant_phone <> '' AND applicant_email <> ''
        )
        DELETE FROM applications a
        USING ranked r
        WHERE a.id = r.id
          AND r.rn > 1
    `);

    await pool.query(`
        CREATE UNIQUE INDEX IF NOT EXISTS applications_phone_email_unique_idx
        ON applications (applicant_phone, applicant_email)
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

    const applicantName = normalizeName(payload.성명);
    const applicantPhone = normalizePhone(payload.연락처);
    const applicantEmail = normalizeEmail(payload.이메일);

    if (!applicantName || !applicantPhone || !applicantEmail) {
        return res.status(400).json({ message: "필수 값이 누락되었습니다." });
    }

    try {
        const result = await pool.query(
            `
            INSERT INTO applications(payload, applicant_name, applicant_phone, applicant_email)
            VALUES($1::jsonb, $2, $3, $4)
            ON CONFLICT (applicant_phone, applicant_email) DO NOTHING
            RETURNING id
            `,
            [JSON.stringify(payload), applicantName, applicantPhone, applicantEmail]
        );
        if (!result.rows[0]) {
            return res.status(409).json({
                message: "이미 동일한 연락처/이메일로 제출된 지원서가 있습니다."
            });
        }
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

app.delete("/api/applications", async (req, res) => {
    const inputPassword = req.headers["x-admin-password"];
    if (inputPassword !== ADMIN_PASSWORD) {
        return res.status(401).json({ message: "관리자 인증 실패" });
    }

    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const normalizedIds = ids
        .map(id => Number(id))
        .filter(id => Number.isInteger(id) && id > 0);

    if (normalizedIds.length === 0) {
        return res.status(400).json({ message: "삭제할 지원서 ID가 없습니다." });
    }

    try {
        const { rowCount } = await pool.query(
            "DELETE FROM applications WHERE id = ANY($1::bigint[])",
            [normalizedIds]
        );
        return res.json({
            message: "삭제 완료",
            deletedCount: rowCount || 0
        });
    } catch (error) {
        return res.status(500).json({ message: "데이터 삭제 중 오류가 발생했습니다." });
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
