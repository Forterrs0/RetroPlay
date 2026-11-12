export function normalizeSql(sql){
  let s=String(sql).replace(/INSERT\s+OR\s+IGNORE\s+INTO/ig,'INSERT INTO');
  const ignore=/INSERT\s+OR\s+IGNORE\s+INTO/i.test(sql);
  if(ignore) s+=' ON CONFLICT DO NOTHING';
  s=s.replace(/GROUP_CONCAT\(DISTINCT\s+g\.name\)/ig,"STRING_AGG(DISTINCT g.name, ',')");
  s=s.replace(/m\.title\s+COLLATE\s+NOCASE/ig,'LOWER(m.title)');
  // Convert positional '?' bind parameters while preserving quoted SQL literals.
  let i=0,quoted=null,output='';
  for(let n=0;n<s.length;n++){
    const c=s[n];
    if(quoted){output+=c;if(c===quoted){if(s[n+1]===quoted){output+=s[++n];}else quoted=null;}continue;}
    if(c==="'" || c==='"'){quoted=c;output+=c;continue;}
    output+=c==='?'?'$'+(++i):c;
  }
  return output;
}

