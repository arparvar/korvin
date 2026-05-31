'use strict';

const fs = require('fs');
const path = require('path');

const SKILLS_DIR = path.join(__dirname, '../../skills');
const ALLOWED_PERMISSIONS = ['read-only', 'network-read', 'local-status'];

function warnSkill(name, reason) {
  console.warn(`[Skills] Skipping ${name}: ${reason}`);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isValidManifest(manifest, skillName) {
  if (!isPlainObject(manifest)) {
    warnSkill(skillName, 'manifest must be a JSON object');
    return false;
  }

  const requiredStrings = ['name', 'trigger', 'permission', 'handler'];
  for (const field of requiredStrings) {
    if (typeof manifest[field] !== 'string' || manifest[field].trim() === '') {
      warnSkill(skillName, `missing or invalid ${field}`);
      return false;
    }
  }

  if (!ALLOWED_PERMISSIONS.includes(manifest.permission)) {
    warnSkill(manifest.name, `permission ${manifest.permission} is not allowed`);
    return false;
  }

  try {
    new RegExp(manifest.trigger);
  } catch (err) {
    warnSkill(manifest.name, `invalid trigger regex: ${err.message}`);
    return false;
  }

  return true;
}

function loadSkillFromDirectory(skillDir, skillName) {
  const manifestPath = path.join(skillDir, 'skill.json');
  if (!fs.existsSync(manifestPath)) return null;

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    warnSkill(skillName, `cannot read skill.json: ${err.message}`);
    return null;
  }

  if (!isValidManifest(manifest, skillName)) return null;

  const handlerPath = path.resolve(skillDir, manifest.handler);
  const skillRoot = path.resolve(skillDir);
  if (!handlerPath.startsWith(`${skillRoot}${path.sep}`)) {
    warnSkill(manifest.name, 'handler path must stay inside the skill directory');
    return null;
  }

  if (path.extname(handlerPath) !== '.js') {
    warnSkill(manifest.name, 'handler must be a .js file');
    return null;
  }

  if (!fs.existsSync(handlerPath)) {
    warnSkill(manifest.name, 'handler file does not exist');
    return null;
  }

  let handler;
  try {
    handler = require(handlerPath);
  } catch (err) {
    warnSkill(manifest.name, `cannot load handler: ${err.message}`);
    return null;
  }

  if (!handler || typeof handler.run !== 'function') {
    warnSkill(manifest.name, 'handler must export a run function');
    return null;
  }

  return {
    name: manifest.name,
    triggerRegex: manifest.trigger,
    permission: manifest.permission,
    run: handler.run,
  };
}

function loadManifestSkills() {
  if (!fs.existsSync(SKILLS_DIR)) return [];

  let entries;
  try {
    entries = fs.readdirSync(SKILLS_DIR, { withFileTypes: true });
  } catch (err) {
    console.warn(`[Skills] Cannot read skills directory: ${err.message}`);
    return [];
  }

  const skills = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const skillDir = path.join(SKILLS_DIR, entry.name);
    const skill = loadSkillFromDirectory(skillDir, entry.name);
    if (skill) skills.push(skill);
  }

  return skills;
}

function dispatchManifestSkill(skills, message) {
  for (const skill of skills || []) {
    try {
      const triggerRegex = new RegExp(skill.triggerRegex);
      if (triggerRegex.test(message)) return skill;
    } catch (err) {
      warnSkill(skill.name || 'unknown skill', `invalid runtime trigger: ${err.message}`);
    }
  }
  return null;
}

module.exports = { loadManifestSkills, dispatchManifestSkill, ALLOWED_PERMISSIONS };
