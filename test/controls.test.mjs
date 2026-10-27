import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { controlSnapshot, controlSaver, restoreControls } from '../src/controls.mjs';

test('重启恢复主人设置的暂停/乱咬/火力/表情开关，不保存聊天内容；新操作覆盖旧状态', async () => {
  const root = await mkdtemp(join(tmpdir(), 'maodie-controls-'));
  const path = join(root, 'controls.json');
  const make = () => ({ config: { selfId: '10001', ownerId: '40001' }, states: new Map([
    ['20001', {groupId:'20001',enabled:true,wildMode:true,spice:0,stickersEnabled:true,history:[{content:'私人聊天'}]}],
    ['20002', {groupId:'20002',enabled:false,wildMode:false,spice:0,stickersEnabled:false}]
  ]) });
  try {
    const original = make(), logs=[];
    const save = controlSaver(original, path, s=>logs.push(s));
    original.states.get('20001').spice=3;
    const first=save(); original.states.get('20001').spice=0; const second=save();
    await Promise.all([first,second]);
    assert.doesNotMatch(await readFile(path, 'utf8'), /私人聊天|history/);
    const after = make(); for(const state of after.states.values()){state.enabled=true;state.wildMode=false;state.spice=3;state.stickersEnabled=true;}
    await restoreControls(after,path);
    assert.deepEqual(controlSnapshot(after),controlSnapshot(original));
    assert.equal(after.states.get('20002').enabled,false);
    assert.deepEqual(logs,[]);
    after.config.ownerId='90001'; await assert.rejects(()=>restoreControls(after,path),/账号配置不一致/);
  } finally {
    assert.equal(dirname(resolve(root)),resolve(tmpdir())); assert.ok(basename(root).startsWith('maodie-'));
    await rm(root,{recursive:true,force:true});
  }
});
