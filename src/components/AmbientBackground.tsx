// พื้นหลังตกแต่ง: วงกลมไล่เฉดฟ้า-ชมพูเบลอ ลอยเบา ๆ + ลวดลายจุดบางอยู่หลังเนื้อหา
// ไม่รับ event และซ่อนจาก screen reader — เพื่อความสวยงามล้วน ๆ
export function AmbientBackground() {
  return (
    <div className="ambient-orbs" aria-hidden>
      <span />
      <span />
      <span />
      <span />
      <i className="ambient-grid" />
    </div>
  );
}
