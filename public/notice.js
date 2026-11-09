export function createNotice(element, { message, close, schedule = setTimeout, cancel = clearTimeout } = {}) {
  let timer = null, revision = 0;
  function clear() {
    revision++;
    if (timer !== null) cancel(timer);
    timer = null; element.hidden = true; element.classList.remove('failure');
    element.setAttribute('role', 'status'); message.textContent = '';
    return revision;
  }
  function show(text, failure = false) {
    clear(); const current = revision;
    message.textContent = String(text); element.classList.toggle('failure', failure);
    element.setAttribute('role', failure ? 'alert' : 'status'); element.hidden = false;
    timer = schedule(() => { if (revision === current) clear(); }, failure ? 12000 : 4500);
  }
  close.addEventListener('click', clear);
  return { clear, show, isCurrent: value => value === revision };
}
