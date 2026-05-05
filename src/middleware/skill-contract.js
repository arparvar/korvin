class SkillResult {
  constructor({ status, summary, data=null, error=null, actions=[], warnings=[] }) {
    this.status = status; this.summary = summary; this.data = data; this.error = error; this.actions = actions; this.warnings = warnings; this.timestamp = new Date().toISOString();
  }
}

SkillResult.success = (s,d,a) => new SkillResult({ status:'success', summary:s, data:d, actions:a });
SkillResult.partial = (s,d,a,w) => new SkillResult({ status:'partial', summary:s, data:d, actions:a, warnings:w });
SkillResult.failed  = (s,e,a) => new SkillResult({ status:'failed', summary:s, error:e?.message||e, actions:a });
SkillResult.cancelled = (r) => new SkillResult({ status:'cancelled', summary:r });
SkillResult.blocked   = (r,f) => new SkillResult({ status:'blocked', summary:r, warnings:f });
SkillResult.unknown   = (s,a) => new SkillResult({ status:'unknown', summary:s, actions:a });

async function executeSkill(name, fn) {
  const start = Date.now();
  let res;
  try {
    res = await fn();
    if (!(res instanceof SkillResult)) {
      console.error(`[SKILL:${name}] Non-SkillResult returned`);
      res = SkillResult.unknown(`Skill returned unexpected format. Verify manually.`);
    }
  } catch (e) {
    console.error(`[SKILL:${name}]`, e);
    res = SkillResult.failed(`Error executing '${name}'. Nothing changed.`, e);
  }
  console.log(`[SKILL:${name}] status=${res.status} (${Date.now()-start}ms)`);
  return res;
}

const STATUS = { SUCCESS:'success', PARTIAL:'partial', FAILED:'failed', CANCELLED:'cancelled', BLOCKED:'blocked', UNKNOWN:'unknown' };
module.exports = { SkillResult, executeSkill, STATUS };
