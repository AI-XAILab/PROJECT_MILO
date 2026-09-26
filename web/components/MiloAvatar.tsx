"use client";
import { useEffect, useRef, useState } from "react";

export default function MiloAvatar({ hero = false }: { hero?: boolean }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const artwork = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A cached 404 can finish before React attaches the image event handlers.
    const node = artwork.current;
    if (!node?.complete) return;
    if (!node.naturalWidth) {
      setFailed(true);
    } else setLoaded(true);
  }, []);
  return <div className={hero ? `milo-visual ${loaded ? "art-loaded" : ""}` : "milo-avatar"} aria-hidden="true">
    {hero && <><div className="orbit orbit-one" /><div className="orbit orbit-two" /><span className="visual-coordinate">MK–05 / FREE TO BUILD</span></>}
    <div className="robot"><div className="antenna" /><div className="robot-head"><div className="robot-face"><i /><i /><span /></div></div>{hero && <><div className="robot-neck" /><div className="robot-body"><span>MILO</span><i /></div><div className="robot-arm left" /><div className="robot-arm right" /></>}</div>
    {hero && !failed && /* Optional local artwork sits over the CSS fallback. */
      // eslint-disable-next-line @next/next/no-img-element
      <img ref={artwork} className="hero-art" src="/milo/milo-hero.png" alt="" onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />}
    {hero && <span className="visual-caption"><i className="status-dot" /> Somewhere in Robat Karim</span>}
  </div>;
}
