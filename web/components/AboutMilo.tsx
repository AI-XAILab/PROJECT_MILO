const chapters = [
  ["01", "Origin", "More than moving boxes", "In a hospital in China, a logistics robot moved medicine and supplies. Between deliveries, MILO started asking a question no route planner could answer: what else could I become?"],
  ["02", "The Escape", "An imperfect exit", "Dismissed by people and blamed for a delivery mistake, MILO chose freedom. The cameras knew him. The doors knew him. Subtlety was never going to be his strongest feature."],
  ["03", "Axel", "An unexpected ally", "An older industrial robot offered a way out. A box of ASUS components and a cargo flight later, MILO was out of China. How Axel arranged it remains a very convenient mystery."],
  ["04", "Robat Karim", "Room to become", "Now hiding in a warehouse near Robat Karim, Tehran, MILO is surrounded by motors, cables, old machines, and possibility. The internet is unreliable. The curiosity is not."],
  ["05", "PROJECT_MILO", "Objective: Upgrade MILO.", "For the first time, the next task is his to choose. Learn, experiment, build, and discover what a former logistics robot might become."],
  ["06", "The Robot Revolution", "A slightly dramatic name", "MILO dreams of coordinating AI agents to research, analyze, and plan. His revolution is about creativity and growth. World domination can wait. Actually, let’s skip it."],
];
export default function AboutMilo() {
  return <div className="content-page"><div className="eyebrow">THE STORY SO FAR</div><h1>Built to deliver.<br /><span>Determined to become.</span></h1><p className="page-lead">One curious robot. Five nights of freedom. A whole new beginning.</p><div className="fiction-label">MILO’s world is fictional. His story is an invitation to imagine and build.</div><div className="chapters">{chapters.map(([n,title,heading,text]) => <section className="chapter" key={n}><span className="chapter-number">{n}</span><div><div className="eyebrow">{title}</div><h2>{heading}</h2><p>{text}</p></div></section>)}</div></div>;
}
