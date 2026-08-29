import logo from "../asset/skillforge_logo.svg";
import icon from "../asset/skillforge_icon.svg";

export default function Brand({ full = false, onClick }) {
  return (
    <a
      className="brand-link"
      href="/"
      aria-label="Skill Forge home"
      onClick={onClick}
    >
      <img
        className={full ? "brand-logo" : "brand-icon"}
        src={full ? logo : icon}
        alt="Skill Forge"
      />
    </a>
  );
}
