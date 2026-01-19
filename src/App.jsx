import React, { useEffect, useMemo, useRef, useState } from "react";

const MAX_ERRORS = 4;

const LS_PLAYER = "tabuada_player_v1";
const LS_BEST_SCORE = "tabuada_best_score_v1";
const LS_BEST_PLAYER = "tabuada_best_player_v1";

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function makeQuestion({ tables, rangeMin, rangeMax }) {
  const a = tables.length ? tables[randInt(0, tables.length - 1)] : randInt(rangeMin, rangeMax);
  const b = randInt(rangeMin, rangeMax);
  const correct = a * b;

  const opts = new Set([correct]);
  while (opts.size < 4) {
    const mode = randInt(1, 4);
    let candidate = correct;

    if (mode === 1) candidate = correct + randInt(-12, 12);
    if (mode === 2) candidate = (a + (randInt(0, 1) ? 1 : -1)) * b;
    if (mode === 3) candidate = a * (b + (randInt(0, 1) ? 1 : -1));
    if (mode === 4) candidate = correct + randInt(-10, 10);

    candidate = Math.abs(candidate);
    if (candidate !== correct && candidate >= 0 && candidate <= 144) opts.add(candidate);
  }

  return {
    a,
    b,
    correct,
    options: shuffle(Array.from(opts)),
    id: crypto.randomUUID?.() ?? String(Date.now() + Math.random()),
  };
}

function lsGet(key, fallback = "") {
  try {
    const v = localStorage.getItem(key);
    return v == null ? fallback : v;
  } catch {
    return fallback;
  }
}

function lsSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function lsGetNum(key, fallback = 0) {
  const v = Number(lsGet(key, String(fallback)));
  return Number.isFinite(v) ? v : fallback;
}

function Hearts({ remaining }) {
  const hearts = Array.from({ length: MAX_ERRORS }, (_, i) => i < remaining);
  return (
    <div className="hearts">
      {hearts.map((on, idx) => (
        <span key={idx} className={on ? "heart on" : "heart off"}>
          ♥
        </span>
      ))}
    </div>
  );
}

function Confetti({ burstKey }) {
  const pieces = useMemo(() => {
    const n = 24;
    return Array.from({ length: n }, (_, i) => ({
      id: `${burstKey}-${i}`,
      left: randInt(8, 92),
      delay: randInt(0, 120) / 1000,
      dur: randInt(70, 120) / 100,
      rot: randInt(0, 360),
      size: randInt(7, 12),
      drift: randInt(-90, 90),
    }));
  }, [burstKey]);

  return (
    <div className="confettiWrap" aria-hidden="true">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="confetti"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.dur}s`,
            transform: `rotate(${p.rot}deg)`,
            width: p.size,
            height: p.size * 0.55,
            "--drift": `${p.drift}px`,
          }}
        />
      ))}
    </div>
  );
}

export default function App() {
  const [screen, setScreen] = useState("menu"); // menu | play | gameover
  const [score, setScore] = useState(0);
  const [errors, setErrors] = useState(0);

  const [player, setPlayer] = useState("");
  const [playerDraft, setPlayerDraft] = useState("");

  const [bestScore, setBestScore] = useState(0);
  const [bestPlayer, setBestPlayer] = useState("");

  const [tablesMode, setTablesMode] = useState("selected");
  const [selectedTables, setSelectedTables] = useState([2, 3, 4, 5]);
  const [rangeMin, setRangeMin] = useState(1);
  const [rangeMax, setRangeMax] = useState(10);

  const [question, setQuestion] = useState(null);
  const [locked, setLocked] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confettiKey, setConfettiKey] = useState(null);

  const audioRef = useRef(null);

  useEffect(() => {
    const p = lsGet(LS_PLAYER, "");
    const bs = lsGetNum(LS_BEST_SCORE, 0);
    const bp = lsGet(LS_BEST_PLAYER, "");
    setPlayer(p);
    setPlayerDraft(p);
    setBestScore(bs);
    setBestPlayer(bp);
  }, []);

  function savePlayer() {
    const name = (playerDraft || "").trim();
    if (!name) return;
    setPlayer(name);
    lsSet(LS_PLAYER, name);
  }

  // ✅ Agora o recorde só é atualizado NO FIM DA PARTIDA
  function updateGlobalRecordAtEnd(finalScore) {
    const name = (player || "").trim() || (lsGet(LS_PLAYER, "") || "").trim();
    if (!name) return;
    if (finalScore > bestScore) {
      setBestScore(finalScore);
      setBestPlayer(name);
      lsSet(LS_BEST_SCORE, String(finalScore));
      lsSet(LS_BEST_PLAYER, name);
    }
  }

  function tapSound(ok) {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = audioRef.current ?? new AudioContext();
      audioRef.current = ctx;

      const o = ctx.createOscillator();
      const g = ctx.createGain();

      o.type = "triangle";
      o.frequency.value = ok ? 740 : 220;
      g.gain.value = 0.0001;

      o.connect(g);
      g.connect(ctx.destination);

      const now = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);

      o.start(now);
      o.stop(now + 0.18);
    } catch {}
  }

  function startGame() {
    if (!(player || "").trim()) savePlayer();
    const finalName = (lsGet(LS_PLAYER, "") || "").trim();
    if (!finalName) return;

    setScore(0);
    setErrors(0);
    setFeedback(null);
    setLocked(false);
    setConfettiKey(null);

    const q = makeQuestion({
      tables: tablesMode === "selected" ? selectedTables : [],
      rangeMin,
      rangeMax,
    });

    setQuestion(q);
    setScreen("play");
  }

  function nextQuestion() {
    const q = makeQuestion({
      tables: tablesMode === "selected" ? selectedTables : [],
      rangeMin,
      rangeMax,
    });
    setQuestion(q);
    setLocked(false);
    setFeedback(null);
  }

  function endGame(finalScore) {
    updateGlobalRecordAtEnd(finalScore);
    setScreen("gameover");
  }

  function continueAfterError() {
    if (!feedback?.waitEnter) return;

    if (errors >= MAX_ERRORS) {
      endGame(score);
      return;
    }
    nextQuestion();
  }

  useEffect(() => {
    function handleKey(e) {
      const tag = e?.target?.tagName ? e.target.tagName.toLowerCase() : "";
      const typing = tag === "input" || tag === "textarea" || tag === "select";
      if (!typing && e.key === "Enter" && feedback?.waitEnter) {
        e.preventDefault();
        continueAfterError();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback, errors, score]);

  function answer(choice) {
    if (!question) return;
    if (feedback?.waitEnter) return;
    if (locked) return;

    setLocked(true);

    const ok = choice === question.correct;
    tapSound(ok);

    if (ok) {
      const add = 10;
      setScore((s) => s + add);

      setFeedback({ ok: true, msg: `Acertou! +${add} pontos 🎉` });
      setConfettiKey(question.id);

      setTimeout(() => nextQuestion(), 650);
    } else {
      const sub = 5;
      setScore((s) => Math.max(0, s - sub));
      setErrors((e) => e + 1);

      setFeedback({
        ok: false,
        correct: question.correct,
        waitEnter: true,
      });

      setLocked(true);
    }
  }

  function toggleTable(n) {
    setSelectedTables((prev) => {
      const set = new Set(prev);
      if (set.has(n)) set.delete(n);
      else set.add(n);
      const arr = Array.from(set).sort((a, b) => a - b);
      return arr.length ? arr : prev;
    });
  }

  const livesRemaining = MAX_ERRORS - errors;
  const canStart = (playerDraft || "").trim().length > 0 || (player || "").trim().length > 0;

  return (
    <div className="bg">
      <style>{css}</style>

      <div className="shell">
        <header className="top">
          <div className="brand">
            <div className="badge">×</div>
            <div>
              <div className="t1">Tabuada Mágica</div>
              <div className="t2">pontos, vidas e recorde</div>
            </div>
          </div>

          <div className="stats">
            <div className="pill">
              <div className="k">Jogador</div>
              <div className="v">{player ? player : "—"}</div>
            </div>
            <div className="pill">
              <div className="k">Recorde</div>
              <div className="v">{bestScore}</div>
            </div>
            <div className="pill">
              <div className="k">Feito por</div>
              <div className="v">{bestScore > 0 ? bestPlayer || "—" : "—"}</div>
            </div>
          </div>
        </header>

        {screen === "menu" && (
          <main className="card">
            <h2>Cadastro do jogador</h2>
            <p>Digite o nome para ficar salvo. O recorde é global e considera a pontuação final da partida.</p>

            <div className="row">
              <input value={playerDraft} onChange={(e) => setPlayerDraft(e.target.value)} placeholder="Ex.: Maria" maxLength={20} />
              <button className="soft" onClick={savePlayer}>Salvar</button>
            </div>

            <h2 style={{ marginTop: 10 }}>Modo</h2>
            <p>Você tem <strong>{MAX_ERRORS}</strong> vidas (erros).</p>

            <div className="mode">
              <div className="seg">
                <button className={tablesMode === "selected" ? "on" : ""} onClick={() => setTablesMode("selected")}>Tabuadas</button>
                <button className={tablesMode === "range" ? "on" : ""} onClick={() => setTablesMode("range")}>Intervalo</button>
              </div>

              {tablesMode === "selected" ? (
                <div className="tables">
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <button key={n} className={selectedTables.includes(n) ? "chip on" : "chip"} onClick={() => toggleTable(n)}>{n}</button>
                  ))}
                </div>
              ) : (
                <div className="range">
                  <label>De
                    <input type="number" min={0} max={12} value={rangeMin} onChange={(e) => setRangeMin(clamp(Number(e.target.value || 0), 0, 12))} />
                  </label>
                  <label>Até
                    <input type="number" min={0} max={12} value={rangeMax} onChange={(e) => setRangeMax(clamp(Number(e.target.value || 0), 0, 12))} />
                  </label>
                </div>
              )}
            </div>

            <button className="cta" onClick={startGame} disabled={!canStart} title={!canStart ? "Cadastre o jogador" : ""}>
              Começar a jogar
            </button>

            <div className="rules">
              <span>✅ +10</span>
              <span>❌ -5</span>
              <span>❤️ {MAX_ERRORS}</span>
            </div>
          </main>
        )}

        {screen === "play" && question && (
          <main className="card play">
            {confettiKey && feedback?.ok && <Confetti burstKey={confettiKey} />}

            <div className="hud">
              <div className="pill big">
                <div className="k">Pontos</div>
                <div className="v">{score}</div>
              </div>

              <div className="lives">
                <div className="lk">Vidas</div>
                <Hearts remaining={livesRemaining} />
              </div>
            </div>

            <div className="q">
              <div className="qtag">Pergunta</div>
              <div className="qtext">
                {question.a} <span className="x">×</span> {question.b} = ?
              </div>

              {feedback?.ok && <div className="fb ok">{feedback.msg}</div>}

              {feedback?.waitEnter && (
                <div className="err">
                  <div className="errT">ERROU</div>
                  <div className="errA">Resposta correta: <strong>{feedback.correct}</strong></div>
                  <div className="errH">Pressione ENTER para continuar</div>
                  <button className="cont" onClick={continueAfterError}>Continuar</button>
                </div>
              )}
            </div>

            <div className="ans">
              {question.options.map((opt) => (
                <button key={opt} className="ansBtn" onClick={() => answer(opt)} disabled={locked || !!feedback?.waitEnter}>
                  {opt}
                </button>
              ))}
            </div>

            <div className="bot">
              <button className="soft" onClick={() => setScreen("menu")}>Voltar ao menu</button>
              <div className="small">Se errar {MAX_ERRORS} vezes, termina.</div>
            </div>
          </main>
        )}

        {screen === "gameover" && (
          <main className="card">
            <h2>Fim de jogo</h2>
            <p>
              Jogador: <strong>{player || "—"}</strong><br />
              Sua pontuação: <strong>{score}</strong><br />
              Recorde global: <strong>{bestScore}</strong> {bestScore > 0 ? <> (por <strong>{bestPlayer || "—"}</strong>)</> : null}
            </p>

            <div className="trophy">🏆</div>

            <button className="cta" onClick={startGame}>Jogar novamente</button>
            <button className="soft" onClick={() => setScreen("menu")}>Alterar modo / Jogador</button>
          </main>
        )}

        <footer className="foot">Ideal para iPad: botões grandes e recorde salvo no aparelho.</footer>
      </div>
    </div>
  );
}

const css = `
:root{--bg1:#7c3aed;--bg2:#06b6d4;--bg3:#f59e0b;--card:rgba(255,255,255,.92);--ink:#111827;--muted:#4b5563;--shadow:0 14px 40px rgba(0,0,0,.18);--r:22px;}
*{box-sizing:border-box;}
html,body{height:100%;margin:0;font-family:ui-rounded,system-ui,-apple-system,Segoe UI,Roboto,Arial;}
button,input{font-family:inherit;}
.bg{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:18px;background:radial-gradient(1200px 800px at 10% 10%, rgba(255,255,255,.25), transparent 55%),radial-gradient(900px 650px at 90% 20%, rgba(255,255,255,.18), transparent 60%),linear-gradient(120deg,var(--bg1),var(--bg2),var(--bg3));animation:hue 10s ease-in-out infinite alternate;}
@keyframes hue{0%{filter:hue-rotate(0deg);}100%{filter:hue-rotate(14deg);}}
.shell{width:min(920px,100%);}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;margin-bottom:10px;color:rgba(255,255,255,.95);text-shadow:0 2px 10px rgba(0,0,0,.18);flex-wrap:wrap;}
.brand{display:flex;align-items:center;gap:10px;}
.badge{width:44px;height:44px;border-radius:14px;display:grid;place-items:center;background:rgba(255,255,255,.22);border:1px solid rgba(255,255,255,.35);font-size:26px;font-weight:900;transform:rotate(8deg);}
.t1{font-weight:1000;font-size:22px;}
.t2{font-size:13px;opacity:.95;}
.stats{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;}
.pill{background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:8px 12px;min-width:160px;}
.k{font-size:12px;opacity:.95;}
.v{font-weight:1000;font-size:18px;}
.card{background:var(--card);border-radius:var(--r);box-shadow:var(--shadow);border:1px solid rgba(255,255,255,.6);padding:16px;position:relative;}
.card h2{margin:4px 0 10px;font-size:26px;color:var(--ink);}
.card p{margin:0 0 12px;color:var(--muted);font-size:16px;line-height:1.45;}
.row{display:flex;gap:10px;flex-wrap:wrap;margin:8px 0 12px;}
.row input{flex:1 1 240px;padding:12px 14px;border-radius:16px;border:1px solid rgba(17,24,39,.14);background:rgba(255,255,255,.92);font-size:16px;font-weight:900;}
.soft{border:0;border-radius:16px;padding:12px 14px;font-size:15px;font-weight:1000;cursor:pointer;background:rgba(255,255,255,.92);box-shadow:0 10px 18px rgba(0,0,0,.10);}
.cta{width:100%;border:0;border-radius:18px;padding:14px 16px;font-size:18px;font-weight:1000;cursor:pointer;color:#0b1220;background:linear-gradient(90deg, rgba(255,255,255,.85), rgba(255,255,255,.95));box-shadow:0 10px 24px rgba(0,0,0,.12);}
.cta:disabled{opacity:.55;cursor:not-allowed;}
.rules{margin-top:12px;display:flex;gap:12px;flex-wrap:wrap;color:var(--muted);font-weight:900;}
.mode{background:rgba(17,24,39,.05);border:1px solid rgba(17,24,39,.08);border-radius:16px;padding:12px;margin:12px 0 14px;}
.seg{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;}
.seg button{border:1px solid rgba(17,24,39,.14);background:rgba(255,255,255,.7);color:var(--ink);border-radius:999px;padding:10px 14px;font-weight:900;font-size:14px;cursor:pointer;}
.seg button.on{background:linear-gradient(90deg, rgba(124,58,237,.22), rgba(6,182,212,.20));border-color:rgba(124,58,237,.35);transform:translateY(-1px);}
.tables{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:8px;}
@media (max-width:760px){.tables{grid-template-columns:repeat(5,minmax(0,1fr));}}
.chip{border:1px solid rgba(17,24,39,.14);background:rgba(255,255,255,.85);border-radius:14px;padding:10px 0;font-weight:1000;font-size:16px;cursor:pointer;}
.chip.on{background:linear-gradient(90deg, rgba(245,158,11,.25), rgba(124,58,237,.22));border-color:rgba(245,158,11,.35);}
.range{display:flex;gap:10px;flex-wrap:wrap;}
.range label{display:flex;flex-direction:column;gap:6px;font-weight:900;color:var(--ink);}
.range input{width:110px;padding:10px 12px;border-radius:14px;border:1px solid rgba(17,24,39,.14);background:rgba(255,255,255,.85);font-size:16px;font-weight:900;}
.play{padding:14px;}
.hud{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:10px;}
.big .v{font-size:22px;}
.lives{background:rgba(17,24,39,.06);border:1px solid rgba(17,24,39,.10);border-radius:18px;padding:10px 12px;min-width:240px;}
.lk{font-weight:1000;color:var(--ink);margin-bottom:6px;}
.hearts{display:flex;gap:6px;flex-wrap:wrap;align-items:center;}
.heart{font-size:20px;filter:drop-shadow(0 4px 10px rgba(0,0,0,.12));}
.heart.on{color:#ef4444;animation:pop .9s ease-in-out infinite alternate;}
.heart.off{color:rgba(239,68,68,.25);}
@keyframes pop{0%{transform:translateY(0) scale(1);}100%{transform:translateY(-1px) scale(1.03);}}
.q{background:rgba(255,255,255,.75);border:1px solid rgba(17,24,39,.10);border-radius:20px;padding:14px;margin:10px 0 12px;position:relative;}
.qtag{position:absolute;top:-10px;left:14px;background:linear-gradient(90deg, rgba(124,58,237,.25), rgba(6,182,212,.20));border:1px solid rgba(124,58,237,.25);border-radius:999px;padding:6px 10px;font-weight:1000;font-size:12px;color:var(--ink);}
.qtext{font-size:44px;font-weight:1100;text-align:center;color:var(--ink);padding:10px 0 2px;}
.x{display:inline-block;transform:translateY(-2px);margin:0 6px;}
@media (max-width:520px){.qtext{font-size:36px;}}
.fb{margin-top:10px;padding:10px 12px;border-radius:16px;font-weight:1000;text-align:center;border:1px solid rgba(17,24,39,.10);}
.fb.ok{background:rgba(34,197,94,.14);}
.ans{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;}
.ansBtn{border:0;border-radius:22px;padding:18px 10px;font-size:26px;font-weight:1100;cursor:pointer;background:linear-gradient(135deg, rgba(245,158,11,.26), rgba(124,58,237,.22), rgba(6,182,212,.18));box-shadow:0 12px 26px rgba(0,0,0,.12);}
.ansBtn:disabled{opacity:.70;cursor:not-allowed;}
.bot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:12px;flex-wrap:wrap;}
.small{color:var(--muted);font-weight:900;font-size:13px;}
.err{background:rgba(239,68,68,.14);border:2px solid rgba(239,68,68,.45);border-radius:20px;padding:14px 12px;margin-top:12px;text-align:center;animation:shake .22s ease-in-out;}
.errT{font-size:46px;font-weight:1100;color:#b91c1c;letter-spacing:1px;margin-bottom:6px;text-transform:uppercase;}
.errA{font-size:20px;font-weight:1000;color:#7f1d1d;margin-bottom:6px;}
.errH{font-size:13px;font-weight:900;color:#7f1d1d;opacity:.95;margin-bottom:10px;}
.cont{border:0;border-radius:16px;padding:12px 14px;font-size:18px;font-weight:1100;cursor:pointer;background:rgba(255,255,255,.92);box-shadow:0 10px 18px rgba(0,0,0,.10);}
@keyframes shake{0%{transform:translateX(0);}25%{transform:translateX(-6px);}50%{transform:translateX(6px);}75%{transform:translateX(-4px);}100%{transform:translateX(0);}}
.confettiWrap{pointer-events:none;position:absolute;inset:0;overflow:hidden;}
.confetti{position:absolute;top:-20px;border-radius:4px;animation-name:confFall;animation-timing-function:cubic-bezier(.18,.7,.2,1);animation-fill-mode:both;box-shadow:0 6px 14px rgba(0,0,0,.12);}
.confetti:nth-child(4n+1){background:#22c55e;}
.confetti:nth-child(4n+2){background:#f97316;}
.confetti:nth-child(4n+3){background:#3b82f6;}
.confetti:nth-child(4n+4){background:#a855f7;}
@keyframes confFall{0%{transform:translate3d(0,0,0) rotate(0deg);opacity:1;}100%{transform:translate3d(var(--drift),720px,0) rotate(520deg);opacity:0;}}
.foot{margin-top:10px;text-align:center;color:rgba(255,255,255,.95);text-shadow:0 2px 10px rgba(0,0,0,.18);font-weight:900;font-size:13px;padding:8px 0 2px;}
`;
