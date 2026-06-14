// ============================================================
// 网易云音乐内置源处理器 — 28 个 API
// 完整转写自 musicdl/modules/sources/netease.py
// ============================================================

import type { InternalSourceHandler } from "./base";
import { IS_NATIVE, getApiUrl } from "@/lib/api/config";
import { apiFetch } from "./api-proxy";
const j = apiFetch; // 别名，所有 handler 中 j() 自动走 CORS 代理
const H = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36" };
const Q = ["jymaster","dolby","sky","jyeffect","hires","lossless","exhigh","standard"];
function dk(e: string): string { return atob(e.substring(14)); }

// --- 通用 helper：逐音质尝试直到获取有效 URL ---
async function tryQualities(fetchFn: (q: string) => Promise<string|null>): Promise<string|null> {
  for (const q of Q) { try { const u = await fetchFn(q); if (u?.startsWith("http")) return u; } catch { continue; } }
  return null;
}

// ========== 以下是 28 个处理器（按 test_apis.py REGISTRY 顺序） ==========

export const wyOfficialHandler: InternalSourceHandler = {
  id: "wy_official",
  async resolveUrl(sid) {
    try { const u = `${getApiUrl()}/music-api/wy-thirdparty/official`;
      const r = await j(u, { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({id:sid}) });
      return r?.url?.startsWith("http") ? r.url : null;
    } catch { return null; }
  }
};

export const wyCggHandler: InternalSourceHandler = {
  id: "wy_cgg",
  async resolveUrl(sid) {
    const base = IS_NATIVE ? "https://api-v2.cenguigui.cn/api/netease/music_v1.php" : `${getApiUrl()}/music-api/wy-thirdparty/cgg`;
    return tryQualities(async (q) => { for (let i=0;i<3;i++) { try { const r=await j(`${base}?id=${sid}&type=json&level=${q}`,{headers:H}); if(r?.data?.url?.startsWith("http")) return r.data.url; break; } catch { if(i<2)continue; } } return null; });
  }
};

export const wyBugpkHandler: InternalSourceHandler = {
  id: "wy_bugpk",
  async resolveUrl(sid) { return tryQualities(async (q)=>{ const r=await j(`https://api.bugpk.com/api/163_music?ids=${sid}&level=${q}&type=json`,{headers:H}); const u=r?.url; return u?.startsWith("http")&&!u.includes("music.163.com/song/media/outer/url")?u:null; }); }
};

export const wyRrvennHandler: InternalSourceHandler = {
  id: "wy_rrvenn",
  async resolveUrl(sid) { return tryQualities(async (q)=>{ const r=await j("https://music.rrvenn.cn/Song_V1",{method:"POST",headers:{...H,"Content-Type":"application/json",Referer:"https://music.rrvenn.cn/"},body:JSON.stringify({url:sid,level:q,type:"json"})}); return r?.data?.url?.startsWith("http")?r.data.url:null; }); }
};

export const wyBileizhenHandler: InternalSourceHandler = {
  id: "wy_bileizhen",
  async resolveUrl(sid) { return tryQualities(async (q)=>{ const r=await j(`https://api.bileizhen.top/api/netease?id=${sid}&level=${q}`,{headers:H}); return r?.data?.url?.startsWith("http")?r.data.url:null; }); }
};

export const wyXuanluogeHandler: InternalSourceHandler = {
  id: "wy_xuanluoge",
  async resolveUrl(sid) { return tryQualities(async (q)=>{ const r=await j(`http://118.24.104.108:3456/api.php?miss=getMusicUrl&id=${sid}&level=${q}`,{headers:H}); return r?.data?.[0]?.url?.startsWith("http")?r.data[0].url:null; }); }
};

export const wyZnnunHandler: InternalSourceHandler = {
  id: "wy_znnu",
  async resolveUrl(sid) { try { const u=`${getApiUrl()}/music-api/wy-thirdparty/znnu`; const r=await j(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:sid})}); return r?.url?.startsWith("http")?r.url:null; } catch { return null; } }
};

export const wyKangqiovoHandler: InternalSourceHandler = {
  id: "wy_kangqiovo",
  async resolveUrl(sid) { return tryQualities(async (q)=>{ const r=await j("https://ncm.kangqiovo.com/Song_V1",{method:"POST",headers:{...H,Referer:"https://ncm.kangqiovo.com/","Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({url:sid,level:q,type:"json"})}); return r?.data?.url?.startsWith("http")?r.data.url:null; }); }
};

export const wyXiaoqinHandler: InternalSourceHandler = {
  id: "wy_xiaoqin",
  async resolveUrl(sid) { try { const u=`${getApiUrl()}/music-api/wy-thirdparty/xiaoqin`; const r=await j(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:sid})}); return r?.url?.startsWith("http")?r.url:null; } catch { return null; } }
};

const XM_KEYS=["YTU4OWY1M2ZlNDI4Yjk1YzAyOTI2MWFhYzQ2ZTYxM2NjZjhlYThjOTk3ZjZjNTMzYjM1ZjQ4NzNiN2Y1YWI1OA","NjFkMzcyNDVlNTIwYmE1NzE1MmQxNzEyMTg5YmNjYWUyNTUwNjhiMzkxZDk3NDFkYTI3N2ExOGM3ZWQ2OTQyYQ","ZjkwNjkzYjM2ODFjY2EwMDA4YjNmOTAxNTVjNWY4MDU3ZmM0YTQ4Zjk2MzgxNmFiNTMzZGQxNzViYzhiOTAxZQ"];
const XM_MAP: Record<string,string>={jymaster:"超清母带",dolby:"杜比全景声",sky:"沉浸环绕声",jyeffect:"高清环绕声",hires:"Hi-Res",lossless:"无损",exhigh:"高音质",standard:"低音质"};

export const wyXingmianHandler: InternalSourceHandler = {
  id: "wy_xingmian",
  async resolveUrl(sid) { return tryQualities(async (q)=>{ const k=dk(XM_KEYS[Math.floor(Math.random()*XM_KEYS.length)]); const m=XM_MAP[q]||"无损"; const r=await j(`https://1.xingmianapi1.ccwu.cc/API/netease.php?id=${sid}&quality=${encodeURIComponent(m)}&apikey=${encodeURIComponent(k)}`,{headers:H}); return r?.data?.url?.startsWith("http")?r.data.url:null; }); }
};

export const wyHaitangwHandler: InternalSourceHandler = {
  id: "wy_haitangw",
  async resolveUrl(sid) { return tryQualities(async (q)=>{ try { const r=await j(`https://musicapi.haitangw.net/music/wy.php?id=${sid}&level=${q}&type=json`,{headers:H}); if(r?.data?.url?.startsWith("http")) return r.data.url; } catch { const r=await j(`https://music.haitangw.cc/music/wy.php?id=${sid}&level=${q}&type=json`,{headers:H}); if(r?.data?.url?.startsWith("http")) return r.data.url; } return null; }); }
};

// wy_guyuei — 需要 XOR 解密 URL → Functions 代理
export const wyGuyueiHandler: InternalSourceHandler = {
  id: "wy_guyuei",
  async resolveUrl(sid) { try { const u=`${getApiUrl()}/music-api/wy-thirdparty/guyuei`; const r=await j(u,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:sid})}); return r?.url?.startsWith("http")?r.url:null; } catch { return null; } }
};

// wy_vincentzyu233 — musicdl: http://xwl.vincentzyu233.cn:51217/v2/music/netease?id=X&quality=9
export const wyVincentzyu233Handler: InternalSourceHandler = {
  id: "wy_vincentzyu233",
  async resolveUrl(sid) { try { const r=await j(`http://xwl.vincentzyu233.cn:51217/v2/music/netease?id=${sid}&quality=9`,{headers:H}); return r?.data?.url?.startsWith("http")?r.data.url:null; } catch { return null; } }
};

// wy_jfjt
export const wyJfjtHandler: InternalSourceHandler = {
  id: "wy_jfjt",
  async resolveUrl(sid) { return tryQualities(async (q)=>{ const r=await j("https://dm.jfjt.cc/Song_V1",{method:"POST",headers:{...H,Referer:"https://dm.jfjt.cc/","Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({url:sid,level:q,type:"json"})}); return r?.data?.url?.startsWith("http")?r.data.url:null; }); }
};

// wy_nanorocky — musicdl: https://metingapi.nanorocky.top/?server=netease&type=url&id=X&br=2000
export const wyNanorockyHandler: InternalSourceHandler = {
  id: "wy_nanorocky",
  async resolveUrl(sid) { try { const r=await j(`https://metingapi.nanorocky.top/?server=netease&type=url&id=${sid}&br=2000`,{headers:H}); return r?.url?.startsWith("http")?r.url:null; } catch { return null; } }
};

// wy_manshuo
export const wyManshuoHandler: InternalSourceHandler = {
  id: "wy_manshuo",
  async resolveUrl(sid) { return tryQualities(async (q)=>{ const r=await j("https://api.manshuo.ink/wyy/Song_V1",{method:"POST",headers:{...H,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({url:sid,level:q,type:"json"})}); return r?.data?.url?.startsWith("http")?r.data.url:null; }); }
};

// wy_cunyu
export const wyCunyuHandler: InternalSourceHandler = {
  id: "wy_cunyu",
  async resolveUrl(sid) { return tryQualities(async (q)=>{ const r=await j(`https://www.cunyuapi.top/163music_play?id=${sid}&quality=${q}`,{headers:H}); return r?.song_file_url?.startsWith("http")?r.song_file_url:null; }); }
};

// wy_qjqq
export const wyQjqqHandler: InternalSourceHandler = {
  id: "wy_qjqq",
  async resolveUrl(sid) { return tryQualities(async (q)=>{ const r=await j("https://metings.qjqq.cn/Song_V1",{method:"POST",headers:{...H,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({url:sid,level:q,type:"json"})}); return r?.data?.url?.startsWith("http")?r.data.url:null; }); }
};

// wy_yutangxiaowu
export const wyYutangxiaowuHandler: InternalSourceHandler = {
  id: "wy_yutangxiaowu",
  async resolveUrl(sid) { return tryQualities(async (q)=>{ const r=await j(`https://yutangxiaowu.cn:4000/Song_V1?url=${sid}&level=${q}&type=json`,{headers:H}); return r?.url?.startsWith("http")?r.url:null; }); }
};

// wy_rxtool — musicdl: https://rxtool.top/api/meteasecloudmusic.php?id=X&level=hires
export const wyRxtoolHandler: InternalSourceHandler = {
  id: "wy_rxtool",
  async resolveUrl(sid) { try { const r=await j(`https://rxtool.top/api/meteasecloudmusic.php?id=${sid}&level=hires`,{headers:H}); return r?.url?.startsWith("http")?r.url:null; } catch { return null; } }
};

// wy_xiaot
export const wyXiaotHandler: InternalSourceHandler = {
  id: "wy_xiaot",
  async resolveUrl(_sid) { try { const r=await j(`https://api.s0o1.com/API/wyy_music/?id=${_sid}&yz=7`,{headers:H}); return r?.data?.url?.startsWith("http")?r.data.url:null; } catch { return null; } }
};

// wy_gdstudio
export const wyGdstudioHandler: InternalSourceHandler = {
  id: "wy_gdstudio",
  async resolveUrl(sid) { try { const r=await j(`https://music-api.gdstudio.xyz/api.php?types=url&id=${sid}&source=netease&br=999`,{headers:H}); return r?.url?.startsWith("http")?r.url:null; } catch { return null; } }
};

// wy_byfuns — musicdl: requests.get(...).text.strip() — returns plain text URL
export const wyByfunsHandler: InternalSourceHandler = {
  id: "wy_byfuns",
  async resolveUrl(sid) { try { const u = await j(`https://api.byfuns.top/1/?id=${sid}&level=hires`,{headers:H}); return typeof u==="string"&&u.startsWith("http")?u.trim():null; } catch { return null; } }
};

// wy_xcvts (for netease)
const XCVTS_KEYS_WY=["ZTA5NDg3ZjVlYjNiZjJmYjIzODQyMDRlNjI3OTYyMWI","MTQ5NThjZGYxOTVlZDc2ODY1YWRhNDM4NzZjMzcxNGM"];
export const wyXcvtsHandler: InternalSourceHandler = {
  id: "wy_xcvts",
  async resolveUrl(sid) { try { const k=dk(XCVTS_KEYS_WY[Math.floor(Math.random()*XCVTS_KEYS_WY.length)]); const r=await j(`https://api.xcvts.cn/api/music/163music?apiKey=${encodeURIComponent(k)}&id=${sid}&br=999000`,{headers:H}); return r?.data?.music?.startsWith("http")?r.data.music:null; } catch { return null; } }
};

// wy_ceseet
export const wyCeseetHandler: InternalSourceHandler = {
  id: "wy_ceseet",
  async resolveUrl(sid) { try { const r=await j(`https://m-api.ceseet.me/url/wy/${sid}/hires`,{headers:{"Content-Type":"application/json","User-Agent":"lx-music-request/2.6.0","X-Request-Key":""}}); return r?.data?.startsWith("http")?r.data:null; } catch { return null; } }
};

// wy_xianyuw (for netease)
const XIANYUW_KEYS_WY=["ODRiMzc5N2Y5MTg0ODFmZGE0ZDkxMWMwZjYzYjc0MzE"];
export const wyXianyuwHandler: InternalSourceHandler = {
  id: "wy_xianyuw",
  async resolveUrl(sid) { try { const k=dk(XIANYUW_KEYS_WY[0]); const r=await j(`https://apii.xianyuw.cn/api/v1/163-music-search?id=${sid}&key=${encodeURIComponent(k)}&no_url=0&br=hires`,{headers:H}); return r?.data?.url?.startsWith("http")?r.data.url:null; } catch { return null; } }
};

// wy_xunjinlu
const XJL_KEYS=["OWUyMjQ5NzhkNjk2MjRjM2JiYjFmNWEzOTg1YmE1ZmQ"];
export const wyXunjinluHandler: InternalSourceHandler = {
  id: "wy_xunjinlu",
  async resolveUrl(sid) { return tryQualities(async (q)=>{ const k=dk(XJL_KEYS[0]); const r=await j(`https://api.xunjinlu.fun/api/wyy/dg/v2.php?action=url&id=${sid}&key=${encodeURIComponent(k)}&quality=${q}`,{headers:H}); return r?.data?.urls?.[0]?.url?.startsWith("http")?r.data.urls[0].url:null; }); }
};

// wy_lblb
export const wyLblbHandler: InternalSourceHandler = {
  id: "wy_lblb",
  async resolveUrl(sid) { return tryQualities(async (q)=>{ const r=await j("https://music163.lblb.eu/Song_V1",{method:"POST",headers:{...H,"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({url:sid,level:q,type:"json"})}); return r?.data?.url?.startsWith("http")?r.data.url:null; }); }
};

// ============================================================
export const WY_HANDLERS: InternalSourceHandler[] = [
  wyOfficialHandler, wyCggHandler, wyBugpkHandler, wyRrvennHandler, wyBileizhenHandler,
  wyXuanluogeHandler, wyZnnunHandler, wyKangqiovoHandler, wyXiaoqinHandler, wyXingmianHandler,
  wyHaitangwHandler, wyGuyueiHandler, wyVincentzyu233Handler, wyJfjtHandler, wyNanorockyHandler,
  wyManshuoHandler, wyCunyuHandler, wyQjqqHandler, wyYutangxiaowuHandler, wyRxtoolHandler,
  wyXiaotHandler, wyGdstudioHandler, wyByfunsHandler, wyXcvtsHandler, wyCeseetHandler,
  wyXianyuwHandler, wyXunjinluHandler, wyLblbHandler,
];
export const WY_HANDLER_MAP: Record<string, InternalSourceHandler> = Object.fromEntries(WY_HANDLERS.map(h=>[h.id,h]));
