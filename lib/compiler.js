// Text compiler - measures char positions using DOM Range API

export function compileText(lineElement) {
  const original = lineElement.querySelector('.original');
  const text = original.textContent;
  
  const range = document.createRange();
  const textNode = original.firstChild;
  
  if (!textNode) {
    return { text: '', chars: [], lineRect: null };
  }
  
  const chars = [];
  const lineRect = original.getBoundingClientRect();
  
  for (let i = 0; i < text.length; i++) {
    range.setStart(textNode, i);
    range.setEnd(textNode, i + 1);
    
    const rect = range.getBoundingClientRect();
    
    chars.push({
      char: text[i],
      x: rect.left - lineRect.left,
      y: rect.top - lineRect.top,
      width: rect.width,
      height: rect.height
    });
  }
  
  return { text, chars, lineRect };
}

export function buildCharElements(lineElement, compiled) {
  const charsContainer = document.createElement('span');
  charsContainer.className = 'chars';
  
  compiled.chars.forEach((c, i) => {
    const span = document.createElement('span');
    span.className = 'char';
    span.textContent = c.char;
    span.style.left = c.x + 'px';
    span.style.top = c.y + 'px';
    span.dataset.index = i;
    span.dataset.baseX = c.x;
    span.dataset.baseY = c.y;
    charsContainer.appendChild(span);
  });
  
  lineElement.appendChild(charsContainer);
  
  return charsContainer;
}

export function compileLine(lineElement) {
  const compiled = compileText(lineElement);
  const charsContainer = buildCharElements(lineElement, compiled);
  return {
    compiled,
    charElements: charsContainer.querySelectorAll('.char')
  };
}
