# ระบบประกาศผลสอบ

MVP สำหรับสร้างรอบสอบ กำหนดชั้น/ห้อง/วิชา นำเข้ารายชื่อพร้อมคะแนนทีละห้อง รวมคะแนนรายวิชา จัดอันดับตามโควตารายห้องหรือทั้งชั้น ประกาศผลเป็น snapshot และให้นักเรียนเช็คผลส่วนตัวผ่านเว็บหรือ LINE Bot/LIFF

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
- `/admin` หน้าผู้ดูแลสำหรับตั้งค่าโรงเรียน อัปโหลดโลโก้ สร้างรอบสอบ ห้อง วิชา นำเข้ารายห้อง คำนวณ และประกาศผล
- `/check-result` หน้าเช็คผลส่วนตัวด้วยรหัสนักเรียน
- `/line` หน้า LIFF สำหรับเชื่อมต่อบัญชี LINE กับรหัสนักเรียน
- `/api/line/webhook` webhook สำหรับ LINE Messaging API ใช้ตอบการ์ดผลคะแนนในแชท

## LINE

- ตั้งค่า LIFF URL เป็น `https://your-domain.vercel.app/line`
- ตั้งค่า Webhook URL ใน Messaging API เป็น `https://your-domain.vercel.app/api/line/webhook`
- Rich Menu แนะนำให้มีปุ่ม `เชื่อมต่อบัญชี` เปิด LIFF และปุ่ม `เช็คผล` เป็น postback `action=check_result` หรือส่งข้อความ `เช็คผล`
- ต้องตั้งค่า `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `NEXT_PUBLIC_LIFF_ID` และ `NEXT_PUBLIC_SITE_URL`

## Excel Template

ไฟล์ตัวอย่างสำหรับนำเข้ารายชื่อพร้อมคะแนนของ “หนึ่งห้อง” อยู่ที่ `/exam-template.csv`

คอลัมน์หลัก:

- `student_id`
- `student_name`
- คอลัมน์คะแนนรายวิชา เช่น `คณิตศาสตร์`, `วิทยาศาสตร์`, `ภาษาไทย`

ก่อนนำเข้า ให้สร้างวิชาในหน้าแอดมินก่อน และตั้งชื่อคอลัมน์คะแนนให้ตรงกับชื่อวิชานั้น

## Verification

```bash
npm test
npm run lint
npm run build
```
