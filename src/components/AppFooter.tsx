export function AppFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`px-5 py-5 text-center text-sm font-medium text-[var(--text-muted)] ${className}`}>
      พัฒนาโดยครูสีสวย ป.6WP (ครูภานุพันธ์ สุดไชย)
    </footer>
  );
}
