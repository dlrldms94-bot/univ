# Render 배포 + 도메인 연결

## 1) GitHub 연결 후 배포
1. 이 프로젝트를 GitHub 저장소에 push
2. Render 대시보드 → `Blueprint` → 저장소 선택
3. 루트의 `render.yaml`을 읽어 Web Service + PostgreSQL 생성
4. Web Service 환경변수 `ADMIN_PASSWORD` 값 설정

## 2) 배포 확인
- `https://<render-web-url>/api/health` 접속 시 `{ ok: true }` 확인
- 지원서: `https://<render-web-url>/apply.html`
- 관리자: `https://<render-web-url>/admin.html`

## 3) 도메인 연결
1. Render Web Service → `Settings` → `Custom Domains`
2. 도메인 추가 (예: `apply.yourdomain.com`)
3. 안내되는 DNS 레코드(CNAME/A) 값을 도메인 관리업체에 등록
4. SSL 발급 완료까지 대기 (자동)

## 4) 주의사항
- 서버는 `DATABASE_URL`(Render PostgreSQL)로 데이터 저장
- 관리자 비밀번호는 `ADMIN_PASSWORD` 환경변수로 관리
- 운영 중 비밀번호 변경 시 관리자 페이지 로그인 비밀번호도 함께 변경
