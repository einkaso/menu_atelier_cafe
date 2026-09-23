type AdminHeaderLink = {
  href: string;
  label: string;
};

export default function AdminSectionHeader({
  eyebrow,
  title,
  links = [],
}: {
  eyebrow: string;
  title: string;
  links?: AdminHeaderLink[];
}) {
  return <header className="admin-topbar admin-section-topbar">
    <img src="/logo-cafe.png" alt="Marta Banaszek atelier-café"/>
    <div className="admin-top-title">
      <span className="admin-eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
    </div>
    {links.length > 0 && <nav className="admin-top-actions" aria-label="Narzędzia panelu">
      {links.map((link) => <a className="admin-secondary" href={link.href} key={link.href}>{link.label}</a>)}
    </nav>}
    <nav className="admin-topbar-leading" aria-label="Powrót do panelu">
      <a className="admin-secondary" href="/admin">Menu główne</a>
    </nav>
  </header>;
}
