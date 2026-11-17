'use strict';
/* Free For Thee — client. No frameworks, no tracking. */

const listEl = document.getElementById('post-list');
const statusEl = document.getElementById('board-status');
const form = document.getElementById('post-form');
const formError = document.getElementById('form-error');
const micBtn = document.getElementById('mic-btn');
const micStatus = document.getElementById('mic-status');
const showClosedEl = document.getElementById('show-closed');

let posts = [];          // all posts from server
let filter = 'all';      // all | matches | need | offer | free | recommend | note
let expandedId = null;

/* ---------- smart matching ---------- */
const STOPWORDS = new Set(('a,an,the,and,or,of,to,in,on,for,with,at,by,from,is,are,was,were,be,been,it,its,this,that,these,those,i,me,my,we,our,you,your,he,she,they,them,his,her,their,do,does,did,can,could,will,would,should,need,needs,needed,help,helping,please,anyone,anybody,somebody,someone,looking,look,want,wants,wanted,like,just,get,got,have,has,had,make,makes,know,thanks,thank,hi,hello,hey,im,i\'m,i\'ve,don\'t,doesn\'t,can\'t,won\'t,not,no,yes,if,when,where,what,how,why,who,whom,which,there,here,about,over,under,into,out,up,down,off,around,near,far,very,really,pretty,also,too,so,but,as,if,than,then,now,today,tomorrow,week,weekend,saturday,sunday,monday,athens,ga,georgia,free,for,sale,sell,selling,buy,buying,price,cost,pay,paid,work,job,jobs,thing,things,stuff,one,two,three,some,any,all,more,most,much,many,few,own,other,another,first,last,new,old,good,great,best,nice,big,small,little,long,short,early,late,soon,urgent,asap').split(','));

function stem(w) {
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  if (w.length > 4 && w.endsWith('es')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s')) w = w.slice(0, -1);
  if (w.length > 3 && w.endsWith('e')) w = w.slice(0, -1);
  return w;
}

function tokens(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9\s$]/g, ' ')
    .split(/\s+/).filter(w => w.length >= 4 && !STOPWORDS.has(w)).map(stem);
}

// Score how well a "need" post matches an "offer" post.
// Title words count double. A match needs score >= 2.
function matchScore(need, offer) {
  const nTitle = new Set(tokens(need.title));
  const nBody = new Set(tokens(need.description));
  const oTitle = new Set(tokens(offer.title));
  const oBody = new Set(tokens(offer.description));
  let score = 0;
  const shared = new Set();
  for (const w of new Set([...nTitle, ...nBody])) {
    if (oTitle.has(w) || oBody.has(w)) {
      shared.add(w);
      score += (nTitle.has(w) ? 2 : 1) + (oTitle.has(w) ? 2 : 1);
    }
  }
  return { score, shared: [...shared] };
}

// Map post id -> array of matching post ids (open posts only, need<->offer)
function computeMatches(all) {
  const open = all.filter(p => p.status === 'open');
  const needs = open.filter(p => p.type === 'need');
  const offers = open.filter(p => p.type === 'offer');
  const map = {};
  for (const n of needs) {
    for (const o of offers) {
      const { score } = matchScore(n, o);
      if (score >= 2) {
        (map[n.id] = map[n.id] || []).push(o.id);
        (map[o.id] = map[o.id] || []).push(n.id);
      }
    }
  }
  return map;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function metaLine(p) {
  const bits = [];
  if (p.area) bits.push(esc(p.area));
  if (p.pay) bits.push(esc(p.pay));
  if (p.urgency) bits.push(esc(p.urgency));
  bits.push('by ' + esc(p.author || 'Neighbor'));
  bits.push(new Date(p.createdAt + 'Z').toLocaleString());
  return bits.join(' · ');
}

function render() {
  const matches = computeMatches(posts);
  let shown = posts.filter(p => showClosedEl.checked || p.status === 'open');
  if (filter === 'matches') {
    shown = shown.filter(p => (matches[p.id] || []).length > 0);
  } else if (filter !== 'all') {
    shown = shown.filter(p => p.type === filter);
  }

  if (!posts.length) {
    statusEl.textContent = 'No posts yet — be the first to post something.';
  } else if (!shown.length) {
    statusEl.textContent = filter === 'matches'
      ? 'No matches yet — post what you need or what you can do and matches will show up here.'
      : 'Nothing in this filter yet.';
  } else {
    statusEl.textContent = shown.length + (shown.length === 1 ? ' post' : ' posts');
  }

  listEl.innerHTML = shown.map(p => {
    const m = matches[p.id] || [];
    const badge = m.length
      ? `<span class="match-badge">${p.type === 'need' ? '✨ Could help you' : '✨ Needs your help'} (${m.length})</span>`
      : '';
    const closedTag = p.status === 'closed' ? ' <span class="reply-count">[Resolved]</span>' : '';
    const inner = `
      <div class="post-top">
        <span class="type-badge ${esc(p.type)}">${esc(p.typeLabel)}</span>${badge}${closedTag}
      </div>
      <h3 class="post-title">${esc(p.title)}</h3>
      <p class="post-meta">${metaLine(p)}</p>
      ${p.description ? `<p class="post-desc">${esc(p.description)}</p>` : ''}
      <p class="reply-count">${p.replyCount} ${p.replyCount === 1 ? 'reply' : 'replies'} — tap to open</p>
      ${expandedId === p.id ? `<div class="detail" data-detail="${p.id}">Loading replies…</div>` : ''}`;
    return `<li class="post-card${p.status === 'closed' ? ' closed' : ''}" data-id="${p.id}">${inner}</li>`;
  }).join('');

  // Fill expanded detail panels
  document.querySelectorAll('[data-detail]').forEach(el => {
    loadDetail(Number(el.dataset.detail), el);
  });
}

async function loadDetail(id, el) {
  try {
    const r = await fetch('/api/posts/' + id);
    const p = await r.json();
    const replies = (p.replies || []).map(rep => `
      <li><div>${esc(rep.body)}</div><div class="r-meta">${esc(rep.author || 'Neighbor')} · ${new Date(rep.createdAt + 'Z').toLocaleString()}</div></li>`).join('');
    el.innerHTML = `
      <ul class="replies">${replies || '<li>No replies yet — be the first.</li>'}</ul>
      <form class="reply-form" data-reply="${id}">
        <input name="author" maxlength="60" placeholder="Your name (optional)">
        <input name="body" maxlength="2000" placeholder="Write a reply…" required>
        <button type="submit">Reply</button>
      </form>
      <button class="resolve-btn" data-resolve="${id}">${p.status === 'closed' ? 'Reopen post' : 'Mark resolved'}</button>`;
    el.querySelector('[data-reply]').addEventListener('submit', async ev => {
      ev.preventDefault();
      const fd = new FormData(ev.target);
      const body = (fd.get('body') || '').toString().trim();
      if (!body) return;
      await fetch('/api/posts/' + id + '/replies', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ author: (fd.get('author') || '').toString().trim() || 'Neighbor', body }),
      });
      await refresh();
    });
    el.querySelector('[data-resolve]').addEventListener('click', async () => {
      await fetch('/api/posts/' + id + (p.status === 'closed' ? '/reopen' : '/close'), { method: 'POST' });
      await refresh();
    });
  } catch (e) {
    el.textContent = 'Could not load replies.';
  }
}

listEl.addEventListener('click', ev => {
  const card = ev.target.closest('.post-card');
  if (!card || ev.target.closest('.detail')) return;
  const id = Number(card.dataset.id);
  expandedId = expandedId === id ? null : id;
  render();
});

async function refresh() {
  try {
    const r = await fetch('/api/posts');
    posts = await r.json();
    render();
  } catch (e) {
    statusEl.textContent = 'Could not load posts. Check your connection and refresh.';
  }
}

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    filter = chip.dataset.filter;
    render();
  });
});
showClosedEl.addEventListener('change', render);

form.addEventListener('submit', async ev => {
  ev.preventDefault();
  formError.hidden = true;
  const payload = {
    title: document.getElementById('f-title').value.trim(),
    type: document.getElementById('f-type').value,
    area: document.getElementById('f-area').value.trim(),
    pay: document.getElementById('f-pay').value.trim(),
    urgency: document.getElementById('f-urgency').value,
    description: document.getElementById('f-desc').value.trim(),
    author: document.getElementById('f-author').value.trim() || 'Neighbor',
  };
  if (!payload.title) { formError.textContent = 'Give your post a title.'; formError.hidden = false; return; }
  const r = await fetch('/api/posts', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) { formError.textContent = 'Could not post. Try again.'; formError.hidden = false; return; }
  form.reset();
  document.getElementById('f-type').value = 'need';
  await refresh();
  window.scrollTo({ top: document.querySelector('.board').offsetTop, behavior: 'smooth' });
});

/* ---------- voice-to-post ---------- */
const AREAS = ['downtown','five points','normaltown','eastside','westside','beechwood','alps','boulevard','river mist','cedar creek','lakewood','green acres','pinewood','chase street','prince avenue','milledge','oconee','winterville','bogart','watkinsville','hull','east athens','north athens'];
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

function parseSpoken(text) {
  const t = text.toLowerCase();
  const out = { title: '', type: 'note', area: '', pay: '', urgency: '', description: text };

  // Type
  if (/\b(free|giving away|for sale|selling)\b/.test(t)) out.type = 'free';
  else if (/\b(recommend|suggest|know a good|anyone know)\b/.test(t)) out.type = 'recommend';
  else if (/\b(i can|i do|i\'ll|i will|available|offering|happy to|i fix|i paint|i mow)\b/.test(t)) out.type = 'offer';
  else if (/\b(need|looking for|can anyone|does anyone|help with|want someone)\b/.test(t)) out.type = 'need';

  // Pay
  const money = t.match(/\$ ?(\d+(?:\.\d{1,2})?)/);
  const spokenMoney = t.match(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|one hundred|ten|fifteen|twenty-five|thirty-five|forty-five|fifty-five)\s+dollars?\b/);
  const WORD_NUM = { ten: '10', fifteen: '15', twenty: '20', 'twenty-five': '25', thirty: '30', 'thirty-five': '35', forty: '40', 'forty-five': '45', fifty: '50', 'fifty-five': '55', sixty: '60', seventy: '70', eighty: '80', ninety: '90', 'one hundred': '100' };
  if (money) out.pay = '$' + money[1];
  else if (spokenMoney) out.pay = '$' + WORD_NUM[spokenMoney[1]];
  else if (/\bfree\b/.test(t)) out.pay = 'Free';

  // Urgency
  if (/\b(asap|urgent|emergency|today|right now)\b/.test(t)) out.urgency = 'Urgent';
  else if (/\b(this week|soon|in the next few days)\b/.test(t)) out.urgency = 'Soon';
  else if (/\b(no rush|whenever|flexible|no hurry)\b/.test(t)) out.urgency = 'Flexible';

  // Area
  for (const a of AREAS) {
    if (t.includes(a)) { out.area = a.replace(/\b\w/g, c => c.toUpperCase()); break; }
  }

  // Title: first ~8 words, cleaned up, capitalized
  const words = text.trim().split(/\s+/).slice(0, 8).join(' ');
  out.title = words.charAt(0).toUpperCase() + words.slice(1);
  return out;
}

if (!SpeechRec) {
  micBtn.disabled = true;
  micBtn.textContent = '🎤 Voice not supported here';
  micStatus.textContent = 'Your browser does not do voice input — just type your post below.';
} else {
  let rec = null;
  micBtn.addEventListener('click', () => {
    if (rec) { try { rec.stop(); } catch (e) {} return; }
    rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    micBtn.classList.add('listening');
    micBtn.textContent = '🔴 Listening… tap to stop';
    micStatus.textContent = 'Listening — say what you need or what you can do…';
    rec.onresult = ev => {
      const transcript = ev.results[0][0].transcript;
      const parsed = parseSpoken(transcript);
      document.getElementById('f-title').value = parsed.title;
      document.getElementById('f-type').value = parsed.type;
      document.getElementById('f-area').value = parsed.area;
      document.getElementById('f-pay').value = parsed.pay;
      document.getElementById('f-urgency').value = parsed.urgency;
      document.getElementById('f-desc').value = parsed.description;
      micStatus.textContent = 'Heard: "' + transcript + '" — check the fields and hit Post it.';
    };
    rec.onerror = () => { micStatus.textContent = 'Did not catch that — try again or type it.'; };
    rec.onend = () => {
      rec = null;
      micBtn.classList.remove('listening');
      micBtn.textContent = '🎤 Speak it';
    };
    rec.start();
  });
}

refresh();
