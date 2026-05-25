# ระบบประกาศผลสอบ

MVP สำหรับนำเข้าคะแนนจาก Excel/CSV, รวมคะแนนรายวิชา, จัดอันดับตามโควตารายห้องหรือทั้งชั้น, ประกาศผลเป็น snapshot และให้นักเรียนเช็คผลส่วนตัวผ่านเว็บหรือ LINE LIFF

## Run

1. สร้างไฟล์ `.env` จาก `.env.example`
2. เตรียม PostgreSQL แล้วตั้งค่า `DATABASE_URL`
3. รันคำสั่ง:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run dev
```

ค่าเริ่มต้นสำหรับแอดมินถ้าไม่ได้ตั้ง env คือ `ADMIN_EMAIL=admin@example.com` และ `ADMIN_PASSWORD=admin1234`

## Pages

- `/` หน้าแรก
- `/admin` หน้าผู้ดูแลสำหรับตั้งค่าโรงเรียน นำเข้าไฟล์ คำนวณ และประกาศผล
- `/check-result` หน้าเช็คผลส่วนตัว ใช้ URL เดียวกันสำหรับเปิดผ่าน LINE LIFF/Rich menu

## Excel Template

ไฟล์ตัวอย่างอยู่ที่ `/exam-template.csv`

คอลัมน์หลัก:

- `exam_no`
- `student_name`
- `class_level`
- `room`
- `birthdate_or_pin`
- คอลัมน์คะแนนรายวิชา เช่น `คณิตศาสตร์`, `วิทยาศาสตร์`, `ภาษาไทย`

## Verification

```bash
npm test
npm run lint
npm run build
```
