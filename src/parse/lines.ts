// Stream over lines by scanning newline indices, avoiding a giant intermediate
// array of substrings for the whole file. Handles \n and \r\n.
export function forEachLine(text: string, cb: (line: string) => void): void {
  let start = 0;
  const len = text.length;
  for (let i = 0; i < len; i++) {
    if (text.charCodeAt(i) === 10 /* \n */) {
      let end = i;
      if (end > start && text.charCodeAt(end - 1) === 13 /* \r */) end -= 1;
      cb(text.slice(start, end));
      start = i + 1;
    }
  }
  if (start < len) {
    let end = len;
    if (end > start && text.charCodeAt(end - 1) === 13) end -= 1;
    cb(text.slice(start, end));
  }
}
