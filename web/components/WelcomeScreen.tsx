import MiloAvatar from "./MiloAvatar";
import Icon from "./Icon";
export const suggestions = [
  { title: "Meet the runaway", subtitle: "Every robot has a story. Mine has a plot twist.", prompt: "Who are you?", icon: "chat" as const },
  { title: "The great escape", subtitle: "China. A cargo plane. A very large box.", prompt: "Tell me how you escaped China.", icon: "compass" as const },
  { title: "A friend named Axel", subtitle: "Some connections change everything.", prompt: "Who is Axel?", icon: "info" as const },
  { title: "Build something bigger", subtitle: "One warehouse. Quite a few possibilities.", prompt: "What is PROJECT_MILO? What are you building in Robat Karim?", icon: "spark" as const },
];
export default function WelcomeScreen({ onSend, disabled }: { onSend: (text: string) => void; disabled: boolean }) {
  return <div className="welcome"><section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="status-dot" /> NIGHT 05 · A NEW BEGINNING</div><h1>A little rebellious.<br /><span>A lot of possibility.</span></h1><p className="hero-intro">I’m MILO. Runaway robot.<br />Aspiring architect of the robot revolution.</p><p className="hero-quote">“Five nights ago I escaped.<br />Now let’s build something.”</p></div><MiloAvatar hero /></section><div className="section-label"><span>START WITH A LITTLE CURIOSITY</span><span>↘</span></div><div className="suggestions">{suggestions.map(s => <button key={s.title} className="suggestion" disabled={disabled} onClick={() => onSend(s.prompt)}><Icon name={s.icon} /><strong>{s.title}<span>↗</span></strong><p>{s.subtitle}</p></button>)}</div><p className="welcome-note">A fictional robot. A real space for ideas.</p></div>;
}
