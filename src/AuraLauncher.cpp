#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN
#define _CRT_SECURE_NO_WARNINGS
#include <windows.h>
#include <windowsx.h>
#include <winhttp.h>
#include <shellapi.h>
#include <stdio.h>
#include <string.h>
#include <wchar.h>

#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "winhttp.lib")
#pragma comment(lib, "shell32.lib")

enum {
  ST_IDLE = 0,
  ST_CHECK,
  ST_READY,
  ST_DOWN,
  ST_APPLY,
  ST_DONE,
  ST_ERR
};

struct Ver {
  int a, b, c, d;
  wchar_t kind; /* 0, 'p', 'r' */
};

static HWND gHwnd;
static HINSTANCE gInst;
static wchar_t gRoot[MAX_PATH];
static wchar_t gLocalStr[64] = L"0.0.0.0";
static wchar_t gRemoteStr[64] = L"—";
static wchar_t gUrl[1024];
static wchar_t gStatus[400] = L"Check GitHub for a newer tag.";
static wchar_t gErr[240];
static Ver gLocal = {0, 0, 0, 0, 0};
static Ver gRemote = {0, 0, 0, 0, 0};
static int gState = ST_IDLE;
static int gPct = 0;
static int gHover = 0;
static int gInstalled = 0;
static int gAuto = 0;
static CRITICAL_SECTION gCs;

#define COL_BG RGB(18, 18, 20)
#define COL_TEXT RGB(236, 236, 240)
#define COL_MUTED RGB(139, 139, 148)
#define COL_ACCENT RGB(196, 58, 120)
#define COL_BTN RGB(30, 30, 36)
#define COL_LINE RGB(44, 44, 52)
#define COL_H1 RGB(58, 16, 24)
#define COL_H2 RGB(107, 34, 48)

#define WM_AURA_UI (WM_APP + 1)

static RECT rCheck = {20, 368, 248, 410};
static RECT rDown = {260, 368, 480, 410};
static RECT rBar = {20, 318, 480, 332};
static RECT rClose = {462, 10, 490, 38};

static void ui(const wchar_t *st, int state, int pct) {
  EnterCriticalSection(&gCs);
  if (st) wcsncpy(gStatus, st, 399);
  if (state >= 0) gState = state;
  if (pct >= 0) gPct = pct;
  LeaveCriticalSection(&gCs);
  if (gHwnd) PostMessageW(gHwnd, WM_AURA_UI, 0, 0);
}

static int parse_ver(const wchar_t *s, Ver *o) {
  if (!s || !o) return 0;
  while (*s == L'v' || *s == L'V' || *s == L' ' || *s == L'\t') s++;
  int n[4] = {0, 0, 0, 0};
  int i = 0;
  for (; i < 4; i++) {
    if (*s < L'0' || *s > L'9') return 0;
    int v = 0;
    while (*s >= L'0' && *s <= L'9') {
      v = v * 10 + (*s - L'0');
      s++;
    }
    n[i] = v;
    if (i < 3) {
      if (*s != L'.') return 0;
      s++;
    }
  }
  wchar_t k = 0;
  if (*s == L'p' || *s == L'P' || *s == L'r' || *s == L'R') {
    k = (*s == L'P' || *s == L'p') ? L'p' : L'r';
    s++;
  }
  while (*s == L' ' || *s == L'\r' || *s == L'\n' || *s == L'\t') s++;
  if (*s) return 0;
  o->a = n[0];
  o->b = n[1];
  o->c = n[2];
  o->d = n[3];
  o->kind = k;
  return 1;
}

static int cmp_quad(Ver x, Ver y) {
  if (x.a != y.a) return x.a - y.a;
  if (x.b != y.b) return x.b - y.b;
  if (x.c != y.c) return x.c - y.c;
  return x.d - y.d;
}

static int is_newer(Ver remote, Ver local) {
  int c = cmp_quad(remote, local);
  if (c > 0) return 1;
  if (c < 0) return 0;
  if (remote.kind == L'p' && local.kind != L'p') return 1;
  return 0;
}

static void fmt_ver(Ver v, wchar_t *out, int n) {
  if (v.kind)
    swprintf(out, n, L"%d.%d.%d.%d%c", v.a, v.b, v.c, v.d, v.kind);
  else
    swprintf(out, n, L"%d.%d.%d.%d", v.a, v.b, v.c, v.d);
}

static void join(wchar_t *dst, int n, const wchar_t *a, const wchar_t *b) {
  swprintf(dst, n, L"%s\\%s", a, b);
}

static int exists(const wchar_t *p) {
  return GetFileAttributesW(p) != INVALID_FILE_ATTRIBUTES;
}

static void read_local() {
  wchar_t path[MAX_PATH], buf[64];
  join(path, MAX_PATH, gRoot, L"version.txt");
  wcsncpy(gLocalStr, L"0.0.0.0", 63);
  gLocal.a = gLocal.b = gLocal.c = gLocal.d = 0;
  gLocal.kind = 0;
  FILE *f = _wfopen(path, L"rt, ccs=UTF-8");
  if (!f) f = _wfopen(path, L"rt");
  if (!f) return;
  if (fgetws(buf, 64, f)) {
    wchar_t *nl = wcspbrk(buf, L"\r\n");
    if (nl) *nl = 0;
    if (parse_ver(buf, &gLocal)) wcsncpy(gLocalStr, buf, 63);
  }
  fclose(f);
}

static void write_local(const wchar_t *s) {
  wchar_t path[MAX_PATH];
  join(path, MAX_PATH, gRoot, L"version.txt");
  FILE *f = _wfopen(path, L"wt, ccs=UTF-8");
  if (!f) f = _wfopen(path, L"wt");
  if (!f) return;
  fputws(s, f);
  fputws(L"\n", f);
  fclose(f);
}

static int installed() {
  wchar_t a[MAX_PATH], b[MAX_PATH];
  join(a, MAX_PATH, gRoot, L"AuraBrowser.exe");
  join(b, MAX_PATH, gRoot, L"engine\\AuraBrowser.exe");
  return exists(a) && exists(b);
}

static int hit(RECT r, int x, int y) {
  POINT p = {x, y};
  return PtInRect(&r, p);
}

static void round_rect(HDC dc, RECT r, int rad, COLORREF fill, COLORREF brd) {
  HPEN pen = CreatePen(PS_SOLID, 1, brd);
  HBRUSH br = CreateSolidBrush(fill);
  HGDIOBJ op = SelectObject(dc, pen);
  HGDIOBJ ob = SelectObject(dc, br);
  RoundRect(dc, r.left, r.top, r.right, r.bottom, rad, rad);
  SelectObject(dc, op);
  SelectObject(dc, ob);
  DeleteObject(pen);
  DeleteObject(br);
}

static void paint(HWND hwnd) {
  PAINTSTRUCT ps;
  HDC hdc = BeginPaint(hwnd, &ps);
  RECT rc;
  GetClientRect(hwnd, &rc);
  HDC m = CreateCompatibleDC(hdc);
  HBITMAP bm = CreateCompatibleBitmap(hdc, rc.right, rc.bottom);
  HGDIOBJ old = SelectObject(m, bm);

  HBRUSH bg = CreateSolidBrush(COL_BG);
  FillRect(m, &rc, bg);
  DeleteObject(bg);

  RECT hdr = {0, 0, rc.right, 92};
  for (int x = -92; x < rc.right + 92; x += 18) {
    HPEN p1 = CreatePen(PS_SOLID, 9, COL_H1);
    HPEN p2 = CreatePen(PS_SOLID, 9, COL_H2);
    SelectObject(m, p1);
    MoveToEx(m, x, 0, 0);
    LineTo(m, x - 92, 92);
    SelectObject(m, p2);
    MoveToEx(m, x + 9, 0, 0);
    LineTo(m, x - 83, 92);
    DeleteObject(p1);
    DeleteObject(p2);
  }
  HPEN edge = CreatePen(PS_SOLID, 1, RGB(42, 12, 18));
  SelectObject(m, edge);
  MoveToEx(m, 0, 92, 0);
  LineTo(m, rc.right, 92);
  DeleteObject(edge);

  RECT badge = {18, 18, 74, 74};
  round_rect(m, badge, 16, COL_ACCENT, RGB(255, 208, 228));
  SetBkMode(m, TRANSPARENT);
  SetTextColor(m, RGB(255, 255, 255));
  HFONT fA = CreateFontW(28, 0, 0, 0, FW_BOLD, 0, 0, 0, DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
  HFONT fT = CreateFontW(22, 0, 0, 0, FW_BOLD, 0, 0, 0, DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
  HFONT fS = CreateFontW(12, 0, 0, 0, FW_SEMIBOLD, 0, 0, 0, DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
  HFONT fB = CreateFontW(13, 0, 0, 0, FW_SEMIBOLD, 0, 0, 0, DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
  HFONT fM = CreateFontW(11, 0, 0, 0, FW_NORMAL, 0, 0, 0, DEFAULT_CHARSET, 0, 0, CLEARTYPE_QUALITY, 0, L"Segoe UI");
  SelectObject(m, fA);
  RECT ta = badge;
  DrawTextW(m, L"A", 1, &ta, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
  SelectObject(m, fT);
  RECT tn = {88, 22, 400, 50};
  DrawTextW(m, L"AURA", -1, &tn, DT_LEFT | DT_VCENTER | DT_SINGLELINE);
  SelectObject(m, fS);
  SetTextColor(m, RGB(232, 208, 214));
  RECT ts = {88, 50, 420, 74};
  const wchar_t *sub = L"SETUP";
  if (gRemote.kind == L'p') sub = L"MANDATORY PATCH";
  else if (!gInstalled) sub = L"INSTALLER";
  DrawTextW(m, sub, -1, &ts, DT_LEFT | DT_VCENTER | DT_SINGLELINE);

  SetTextColor(m, RGB(232, 208, 214));
  DrawTextW(m, L"X", 1, &rClose, DT_CENTER | DT_VCENTER | DT_SINGLELINE);

  wchar_t loc[64], rem[64], st[400];
  int state, pct, inst;
  Ver rk;
  EnterCriticalSection(&gCs);
  wcsncpy(loc, gLocalStr, 63);
  wcsncpy(rem, gRemoteStr, 63);
  wcsncpy(st, gStatus, 399);
  state = gState;
  pct = gPct;
  inst = gInstalled;
  rk = gRemote;
  LeaveCriticalSection(&gCs);

  SelectObject(m, fM);
  SetTextColor(m, COL_MUTED);
  RECT k1 = {20, 112, 120, 130};
  RECT k2 = {20, 140, 120, 158};
  DrawTextW(m, L"INSTALLED", -1, &k1, DT_LEFT | DT_VCENTER | DT_SINGLELINE);
  DrawTextW(m, L"LATEST", -1, &k2, DT_LEFT | DT_VCENTER | DT_SINGLELINE);
  SelectObject(m, fB);
  SetTextColor(m, COL_TEXT);
  RECT v1 = {120, 110, 320, 132};
  RECT v2 = {120, 138, 320, 160};
  DrawTextW(m, inst ? loc : L"—", -1, &v1, DT_LEFT | DT_VCENTER | DT_SINGLELINE);
  DrawTextW(m, rem, -1, &v2, DT_LEFT | DT_VCENTER | DT_SINGLELINE);

  RECT chip = {330, 138, 480, 160};
  COLORREF chipBg = COL_BTN, chipTx = COL_MUTED, chipBd = COL_LINE;
  const wchar_t *chipT = L"git";
  if (rk.kind == L'p') {
    chipBg = RGB(56, 16, 22);
    chipTx = RGB(255, 196, 200);
    chipBd = RGB(224, 36, 58);
    chipT = L"patch";
  } else if (rk.kind == L'r') {
    chipBg = RGB(48, 20, 36);
    chipTx = RGB(255, 208, 228);
    chipBd = COL_ACCENT;
    chipT = L"release";
  } else if (state == ST_DONE) {
    chipT = L"current";
  }
  round_rect(m, chip, 12, chipBg, chipBd);
  SetTextColor(m, chipTx);
  SelectObject(m, fS);
  DrawTextW(m, chipT, -1, &chip, DT_CENTER | DT_VCENTER | DT_SINGLELINE);

  SelectObject(m, fB);
  SetTextColor(m, RGB(200, 200, 208));
  RECT sr = {20, 180, 480, 250};
  DrawTextW(m, st, -1, &sr, DT_LEFT | DT_TOP | DT_WORDBREAK);

  round_rect(m, rBar, 8, RGB(26, 26, 31), COL_LINE);
  int span = rBar.right - rBar.left;
  int fw = span * pct / 100;
  if (fw > 0) {
    RECT fr = rBar;
    fr.right = fr.left + fw;
    if (fr.right > rBar.right) fr.right = rBar.right;
    round_rect(m, fr, 8, COL_ACCENT, COL_ACCENT);
  }
  wchar_t pbuf[16];
  swprintf(pbuf, 16, L"%d%%", pct);
  SetTextColor(m, COL_TEXT);
  SelectObject(m, fS);
  DrawTextW(m, pbuf, -1, (RECT *)&rBar, DT_CENTER | DT_VCENTER | DT_SINGLELINE);

  int canCheck = (state != ST_CHECK && state != ST_DOWN && state != ST_APPLY);
  int canDown = (state == ST_READY) || (!inst && state != ST_DOWN && state != ST_APPLY && state != ST_CHECK);
  COLORREF c1 = gHover == 1 ? RGB(40, 40, 48) : COL_BTN;
  COLORREF c2 = gHover == 2 ? RGB(214, 74, 138) : COL_ACCENT;
  if (!canCheck) c1 = RGB(24, 24, 28);
  if (!canDown) c2 = RGB(70, 30, 48);
  round_rect(m, rCheck, 12, c1, COL_LINE);
  round_rect(m, rDown, 12, c2, c2);
  SetTextColor(m, canCheck ? COL_TEXT : COL_MUTED);
  SelectObject(m, fB);
  DrawTextW(m, L"Check Update", -1, &rCheck, DT_CENTER | DT_VCENTER | DT_SINGLELINE);
  SetTextColor(m, RGB(255, 255, 255));
  DrawTextW(m, L"Download", -1, &rDown, DT_CENTER | DT_VCENTER | DT_SINGLELINE);

  SelectObject(m, fM);
  SetTextColor(m, RGB(109, 109, 118));
  RECT ft = {20, 422, 480, 444};
  DrawTextW(m, L"github.com/SelfC0de/Aura-Browser", -1, &ft, DT_LEFT | DT_VCENTER | DT_SINGLELINE);

  BitBlt(hdc, 0, 0, rc.right, rc.bottom, m, 0, 0, SRCCOPY);
  SelectObject(m, old);
  DeleteObject(bm);
  DeleteDC(m);
  DeleteObject(fA);
  DeleteObject(fT);
  DeleteObject(fS);
  DeleteObject(fB);
  DeleteObject(fM);
  EndPaint(hwnd, &ps);
}

static int run_cmd(const wchar_t *exe, const wchar_t *args, const wchar_t *cwd) {
  wchar_t cmd[2048];
  swprintf(cmd, 2048, L"\"%s\" %s", exe, args ? args : L"");
  STARTUPINFOW si;
  PROCESS_INFORMATION pi;
  ZeroMemory(&si, sizeof(si));
  si.cb = sizeof(si);
  ZeroMemory(&pi, sizeof(pi));
  if (!CreateProcessW(exe, cmd, 0, 0, FALSE, CREATE_NO_WINDOW, 0, cwd, &si, &pi))
    return -1;
  WaitForSingleObject(pi.hProcess, INFINITE);
  DWORD code = 1;
  GetExitCodeProcess(pi.hProcess, &code);
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);
  return (int)code;
}

static void kill_browser() {
  wchar_t sys[MAX_PATH];
  GetSystemDirectoryW(sys, MAX_PATH);
  wchar_t exe[MAX_PATH];
  swprintf(exe, MAX_PATH, L"%s\\taskkill.exe", sys);
  run_cmd(exe, L"/IM AuraBrowser.exe /F /T", 0);
  Sleep(400);
}

static int http_get(const wchar_t *host, const wchar_t *path, int download, const wchar_t *outFile) {
  HINTERNET s = WinHttpOpen(L"AuraLauncher/0.0.0.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, 0, 0, 0);
  if (!s) return 0;
  DWORD redir = WINHTTP_OPTION_REDIRECT_POLICY_ALWAYS;
  WinHttpSetOption(s, WINHTTP_OPTION_REDIRECT_POLICY, &redir, sizeof(redir));
  HINTERNET c = WinHttpConnect(s, host, INTERNET_DEFAULT_HTTPS_PORT, 0);
  if (!c) {
    WinHttpCloseHandle(s);
    return 0;
  }
  HINTERNET r = WinHttpOpenRequest(c, L"GET", path, 0, 0, 0, WINHTTP_FLAG_SECURE);
  if (!r) {
    WinHttpCloseHandle(c);
    WinHttpCloseHandle(s);
    return 0;
  }
  WinHttpAddRequestHeaders(r, L"Accept: application/vnd.github+json\r\nUser-Agent: AuraLauncher/0.0.0.0", (ULONG)-1, WINHTTP_ADDREQ_FLAG_ADD);
  if (!WinHttpSendRequest(r, 0, 0, 0, 0, 0, 0) || !WinHttpReceiveResponse(r, 0)) {
    WinHttpCloseHandle(r);
    WinHttpCloseHandle(c);
    WinHttpCloseHandle(s);
    return 0;
  }
  DWORD status = 0, sl = sizeof(status);
  WinHttpQueryHeaders(r, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER, 0, &status, &sl, 0);
  wchar_t clbuf[32];
  DWORD cll = sizeof(clbuf);
  ULONGLONG total = 0;
  if (WinHttpQueryHeaders(r, WINHTTP_QUERY_CONTENT_LENGTH, 0, clbuf, &cll, 0))
    total = _wcstoui64(clbuf, 0, 10);

  HANDLE hf = INVALID_HANDLE_VALUE;
  char *mem = 0;
  DWORD cap = 0, used = 0;
  if (download) {
    hf = CreateFileW(outFile, GENERIC_WRITE, 0, 0, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, 0);
    if (hf == INVALID_HANDLE_VALUE) {
      WinHttpCloseHandle(r);
      WinHttpCloseHandle(c);
      WinHttpCloseHandle(s);
      return 0;
    }
  }
  ULONGLONG got = 0;
  for (;;) {
    DWORD avail = 0;
    if (!WinHttpQueryDataAvailable(r, &avail)) break;
    if (!avail) break;
    char *tmp = (char *)HeapAlloc(GetProcessHeap(), 0, avail + 1);
    if (!tmp) break;
    DWORD rd = 0;
    if (!WinHttpReadData(r, tmp, avail, &rd) || !rd) {
      HeapFree(GetProcessHeap(), 0, tmp);
      break;
    }
    got += rd;
    if (download) {
      DWORD wr = 0;
      WriteFile(hf, tmp, rd, &wr, 0);
      HeapFree(GetProcessHeap(), 0, tmp);
      int p = 0;
      if (total) p = (int)((got * 100) / total);
      if (p > 99) p = 99;
      ui(L"Downloading release zip…", ST_DOWN, p);
    } else {
      DWORD need = used + rd + 1;
      if (need > cap) {
        DWORD nc = cap ? cap * 2 : 1 << 16;
        while (nc < need) nc *= 2;
        char *nmem = mem ? (char *)HeapReAlloc(GetProcessHeap(), 0, mem, nc)
                         : (char *)HeapAlloc(GetProcessHeap(), 0, nc);
        if (!nmem) {
          HeapFree(GetProcessHeap(), 0, tmp);
          break;
        }
        mem = nmem;
        cap = nc;
      }
      memcpy(mem + used, tmp, rd);
      used += rd;
      HeapFree(GetProcessHeap(), 0, tmp);
    }
  }
  int ok = 0;
  if (download) {
    CloseHandle(hf);
    ok = (status >= 200 && status < 300 && got > 0);
    if (ok) ui(L"Download complete.", ST_DOWN, 100);
  } else {
    if (mem && status >= 200 && status < 400) {
      mem[used] = 0;
      /* stash in gErr-sized? write to temp file json */
      wchar_t jp[MAX_PATH];
      join(jp, MAX_PATH, gRoot, L"updates");
      CreateDirectoryW(jp, 0);
      join(jp, MAX_PATH, jp, L"releases.json");
      FILE *f = _wfopen(jp, L"wb");
      if (f) {
        fwrite(mem, 1, used, f);
        fclose(f);
        ok = 1;
      }
    }
    if (mem) HeapFree(GetProcessHeap(), 0, mem);
  }
  WinHttpCloseHandle(r);
  WinHttpCloseHandle(c);
  WinHttpCloseHandle(s);
  return ok;
}

static int json_find_quoted(const char *json, const char *key, int nth, char *out, int n) {
  char pat[80];
  sprintf(pat, "\"%s\"", key);
  const char *p = json;
  for (int i = 0; i <= nth; i++) {
    p = strstr(p, pat);
    if (!p) return 0;
    p += strlen(pat);
  }
  p = strchr(p, ':');
  if (!p) return 0;
  p++;
  while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
  if (*p != '"') return 0;
  p++;
  int i = 0;
  while (*p && *p != '"' && i < n - 1) {
    if (*p == '\\' && p[1]) p++;
    out[i++] = *p++;
  }
  out[i] = 0;
  return i > 0;
}

static int pick_release(const char *json) {
  gUrl[0] = 0;
  gRemoteStr[0] = 0;
  gRemote.kind = 0;
  Ver best;
  memset(&best, 0, sizeof(best));
  int have = 0;
  char tag[64];
  for (int i = 0; i < 40; i++) {
    if (!json_find_quoted(json, "tag_name", i, tag, 64)) break;
    wchar_t wtag[64];
    MultiByteToWideChar(CP_UTF8, 0, tag, -1, wtag, 64);
    Ver v;
    if (!parse_ver(wtag, &v)) continue;
    if (!gInstalled) {
      if (!have || cmp_quad(v, best) > 0 || (cmp_quad(v, best) == 0 && v.kind == L'p' && best.kind != L'p')) {
        best = v;
        have = 1;
      }
      continue;
    }
    if (is_newer(v, gLocal)) {
      if (!have || cmp_quad(v, best) > 0 || (cmp_quad(v, best) == 0 && v.kind == L'p' && best.kind != L'p')) {
        best = v;
        have = 1;
      }
    }
  }
  if (!have) return 0;
  fmt_ver(best, gRemoteStr, 64);
  gRemote = best;
  char want[64];
  WideCharToMultiByte(CP_UTF8, 0, gRemoteStr, -1, want, 64, 0, 0);
  char url[1024];
  const char *q = json;
  for (int i = 0; i < 80; i++) {
    if (!json_find_quoted(q, "browser_download_url", 0, url, 1024)) break;
    const char *pos = strstr(q, "\"browser_download_url\"");
    if (!pos) break;
    if (strstr(url, ".zip") && (strstr(url, want) || strstr(url, "Aura"))) {
      MultiByteToWideChar(CP_UTF8, 0, url, -1, gUrl, 1024);
      return 1;
    }
    q = pos + 22;
  }
  q = json;
  for (int i = 0; i < 80; i++) {
    if (!json_find_quoted(q, "browser_download_url", 0, url, 1024)) break;
    const char *pos = strstr(q, "\"browser_download_url\"");
    if (!pos) break;
    if (strstr(url, ".zip")) {
      MultiByteToWideChar(CP_UTF8, 0, url, -1, gUrl, 1024);
      return 1;
    }
    q = pos + 22;
  }
  return 1;
}

static DWORD WINAPI th_check(LPVOID) {
  ui(L"Checking GitHub releases…", ST_CHECK, gPct);
  wchar_t upd[MAX_PATH];
  join(upd, MAX_PATH, gRoot, L"updates");
  CreateDirectoryW(upd, 0);
  if (!http_get(L"api.github.com", L"/repos/SelfC0de/Aura-Browser/releases?per_page=20", 0, 0)) {
    ui(L"GitHub unreachable. Publish a release at SelfC0de/Aura-Browser.", ST_ERR, 0);
    return 0;
  }
  wchar_t jp[MAX_PATH];
  join(jp, MAX_PATH, gRoot, L"updates\\releases.json");
  FILE *f = _wfopen(jp, L"rb");
  if (!f) {
    ui(L"No release list.", ST_ERR, 0);
    return 0;
  }
  fseek(f, 0, SEEK_END);
  long n = ftell(f);
  fseek(f, 0, SEEK_SET);
  char *json = (char *)HeapAlloc(GetProcessHeap(), 0, n + 1);
  if (!json) {
    fclose(f);
    return 0;
  }
  fread(json, 1, n, f);
  json[n] = 0;
  fclose(f);
  if (n < 8 || json[0] == '{') {
    /* 404 object */
    HeapFree(GetProcessHeap(), 0, json);
    if (!gInstalled)
      ui(L"No GitHub releases yet. Drop aura-payload.zip next to this exe, or publish v0.0.0.1r.", ST_IDLE, 0);
    else
      ui(L"This copy is up to date. No newer tag on GitHub.", ST_DONE, 0);
    wcsncpy(gRemoteStr, gLocalStr, 63);
    return 0;
  }
  int hit = pick_release(json);
  HeapFree(GetProcessHeap(), 0, json);
  if (!hit) {
    wcsncpy(gRemoteStr, gLocalStr, 63);
    gRemote = gLocal;
    ui(L"This copy is up to date.", ST_DONE, 0);
    return 0;
  }
  wchar_t msg[400];
  if (!gInstalled) {
    swprintf(msg, 400, L"Payload %s — Download unpacks next to AuraLauncher.exe (AuraBrowser.exe + engine). data\\ is created on first run.", gRemoteStr);
    ui(msg, ST_READY, 0);
  } else if (gRemote.kind == L'p') {
    swprintf(msg, 400, L"Mandatory patch %s. Download replaces files next to AuraBrowser.exe. Profile data\\ is kept.", gRemoteStr);
    ui(msg, ST_READY, 0);
  } else {
    swprintf(msg, 400, L"Release %s is available. Download replaces files next to AuraBrowser.exe. Profile data\\ is kept.", gRemoteStr);
    ui(msg, ST_READY, 0);
  }
  return 0;
}

static int unzip(const wchar_t *zip, const wchar_t *dest) {
  wchar_t tar[MAX_PATH];
  GetSystemDirectoryW(tar, MAX_PATH);
  wcscat(tar, L"\\tar.exe");
  wchar_t args[1024];
  swprintf(args, 1024, L"-xf \"%s\" -C \"%s\"", zip, dest);
  return run_cmd(tar, args, dest) == 0;
}

static int copy_tree(const wchar_t *src, const wchar_t *dst) {
  wchar_t rob[MAX_PATH];
  GetSystemDirectoryW(rob, MAX_PATH);
  wcscat(rob, L"\\robocopy.exe");
  wchar_t args[1400];
  swprintf(args, 1400,
           L"\"%s\" \"%s\" /E /XD data updates src .git /XF AuraLauncher.exe /NFL /NDL /NJH /NJS /nc /ns /np",
           src, dst);
  int c = run_cmd(rob, args, 0);
  /* robocopy 0-7 = success */
  return c >= 0 && c < 8;
}

static int find_payload_dir(const wchar_t *stage, wchar_t *out, int n) {
  wchar_t probe[MAX_PATH];
  swprintf(probe, MAX_PATH, L"%s\\AuraBrowser.exe", stage);
  if (exists(probe)) {
    wcsncpy(out, stage, n);
    return 1;
  }
  WIN32_FIND_DATAW fd;
  wchar_t pat[MAX_PATH];
  swprintf(pat, MAX_PATH, L"%s\\*", stage);
  HANDLE h = FindFirstFileW(pat, &fd);
  if (h == INVALID_HANDLE_VALUE) return 0;
  int ok = 0;
  do {
    if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) continue;
    if (fd.cFileName[0] == L'.') continue;
    swprintf(probe, MAX_PATH, L"%s\\%s\\AuraBrowser.exe", stage, fd.cFileName);
    if (exists(probe)) {
      swprintf(out, n, L"%s\\%s", stage, fd.cFileName);
      ok = 1;
      break;
    }
  } while (FindNextFileW(h, &fd));
  FindClose(h);
  return ok;
}

static int extract_embedded(const wchar_t *zipOut) {
  wchar_t self[MAX_PATH];
  GetModuleFileNameW(0, self, MAX_PATH);
  HANDLE hf = CreateFileW(self, GENERIC_READ, FILE_SHARE_READ, 0, OPEN_EXISTING, 0, 0);
  if (hf == INVALID_HANDLE_VALUE) return 0;
  LARGE_INTEGER sz;
  GetFileSizeEx(hf, &sz);
  if (sz.QuadPart < 24) {
    CloseHandle(hf);
    return 0;
  }
  LARGE_INTEGER pos;
  pos.QuadPart = sz.QuadPart - 20;
  SetFilePointerEx(hf, pos, 0, FILE_BEGIN);
  char mag[12];
  DWORD rd = 0;
  ULONGLONG zsz = 0;
  ReadFile(hf, mag, 12, &rd, 0);
  ReadFile(hf, &zsz, 8, &rd, 0);
  if (memcmp(mag, "AURAPAYLOAD1", 12) != 0 || zsz < 16 || zsz > (ULONGLONG)sz.QuadPart) {
    CloseHandle(hf);
    return 0;
  }
  pos.QuadPart = sz.QuadPart - 20 - (LONGLONG)zsz;
  SetFilePointerEx(hf, pos, 0, FILE_BEGIN);
  HANDLE out = CreateFileW(zipOut, GENERIC_WRITE, 0, 0, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, 0);
  if (out == INVALID_HANDLE_VALUE) {
    CloseHandle(hf);
    return 0;
  }
  char buf[1 << 16];
  ULONGLONG left = zsz;
  ULONGLONG got = 0;
  while (left) {
    DWORD chunk = left > sizeof(buf) ? (DWORD)sizeof(buf) : (DWORD)left;
    if (!ReadFile(hf, buf, chunk, &rd, 0) || !rd) break;
    DWORD wr = 0;
    WriteFile(out, buf, rd, &wr, 0);
    left -= rd;
    got += rd;
    int p = (int)((got * 100) / zsz);
    ui(L"Extracting packed payload…", ST_APPLY, p > 99 ? 99 : p);
  }
  CloseHandle(out);
  CloseHandle(hf);
  return left == 0;
}

static int apply_zip(const wchar_t *zip) {
  wchar_t stage[MAX_PATH], src[MAX_PATH];
  join(stage, MAX_PATH, gRoot, L"updates\\stage");
  wchar_t sys[MAX_PATH];
  GetSystemDirectoryW(sys, MAX_PATH);
  wchar_t cmd[MAX_PATH];
  swprintf(cmd, MAX_PATH, L"%s\\cmd.exe", sys);
  wchar_t args[600];
  swprintf(args, 600, L"/c rmdir /s /q \"%s\" & mkdir \"%s\"", stage, stage);
  run_cmd(cmd, args, 0);
  CreateDirectoryW(stage, 0);
  ui(L"Unpacking next to AuraBrowser.exe…", ST_APPLY, 100);
  if (!unzip(zip, stage)) {
    ui(L"Unpack failed (tar).", ST_ERR, 100);
    return 0;
  }
  if (!find_payload_dir(stage, src, MAX_PATH)) {
    ui(L"Zip has no AuraBrowser.exe. Tag a zip of the install folder.", ST_ERR, 100);
    return 0;
  }
  kill_browser();
  if (!copy_tree(src, gRoot)) {
    ui(L"Copy into install folder failed.", ST_ERR, 100);
    return 0;
  }
  write_local(gRemoteStr[0] ? gRemoteStr : L"0.0.0.0");
  read_local();
  gInstalled = installed();
  ui(L"Installed. Files sit next to AuraBrowser.exe. Profile data\\ was kept.", ST_DONE, 100);
  wchar_t stub[MAX_PATH];
  join(stub, MAX_PATH, gRoot, L"AuraBrowser.exe");
  if (exists(stub)) {
    ShellExecuteW(0, L"open", stub, 0, gRoot, SW_SHOWNORMAL);
  }
  return 1;
}

static DWORD WINAPI th_down(LPVOID) {
  wchar_t upd[MAX_PATH], zip[MAX_PATH], side[MAX_PATH];
  join(upd, MAX_PATH, gRoot, L"updates");
  CreateDirectoryW(upd, 0);
  join(zip, MAX_PATH, upd, L"payload.zip");
  join(side, MAX_PATH, gRoot, L"aura-payload.zip");

  if (!gUrl[0] && exists(side)) {
    CopyFileW(side, zip, FALSE);
    ui(L"Using aura-payload.zip beside the launcher.", ST_APPLY, 100);
    apply_zip(zip);
    return 0;
  }
  if (!gUrl[0] && extract_embedded(zip)) {
    apply_zip(zip);
    return 0;
  }
  if (!gUrl[0]) {
    /* parse host/path from empty — try check first */
    ui(L"No asset URL. Check Update, then Download. Zip name must end with .zip.", ST_ERR, 0);
    return 0;
  }
  /* https://github.com/... or https://objects.githubusercontent.com/ */
  const wchar_t *p = gUrl;
  if (!wcsncmp(p, L"https://", 8)) p += 8;
  wchar_t host[160], path[860];
  const wchar_t *sl = wcschr(p, L'/');
  if (!sl) {
    ui(L"Bad asset URL.", ST_ERR, 0);
    return 0;
  }
  wcsncpy(host, p, 159);
  host[sl - p] = 0;
  wcsncpy(path, sl, 859);
  ui(L"Downloading release zip…", ST_DOWN, 0);
  if (!http_get(host, path, 1, zip)) {
    ui(L"Download failed.", ST_ERR, gPct);
    return 0;
  }
  apply_zip(zip);
  return 0;
}

static void on_check() {
  if (gState == ST_CHECK || gState == ST_DOWN || gState == ST_APPLY) return;
  HANDLE h = CreateThread(0, 0, th_check, 0, 0, 0);
  if (h) CloseHandle(h);
}

static void on_down() {
  if (gState == ST_CHECK || gState == ST_DOWN || gState == ST_APPLY) return;
  if (gState != ST_READY && gInstalled && gUrl[0] == 0) return;
  HANDLE h = CreateThread(0, 0, th_down, 0, 0, 0);
  if (h) CloseHandle(h);
}

static LRESULT CALLBACK wnd(HWND hwnd, UINT m, WPARAM w, LPARAM l) {
  switch (m) {
  case WM_AURA_UI:
    InvalidateRect(hwnd, 0, FALSE);
    return 0;
  case WM_PAINT:
    paint(hwnd);
    return 0;
  case WM_MOUSEMOVE: {
    int x = GET_X_LPARAM(l), y = GET_Y_LPARAM(l);
    int hov = 0;
    if (hit(rCheck, x, y)) hov = 1;
    else if (hit(rDown, x, y)) hov = 2;
    else if (hit(rClose, x, y)) hov = 3;
    if (hov != gHover) {
      gHover = hov;
      InvalidateRect(hwnd, 0, FALSE);
    }
    TRACKMOUSEEVENT tme = {sizeof(tme), TME_LEAVE, hwnd, 0};
    TrackMouseEvent(&tme);
    return 0;
  }
  case WM_MOUSELEAVE:
    gHover = 0;
    InvalidateRect(hwnd, 0, FALSE);
    return 0;
  case WM_LBUTTONUP: {
    int x = GET_X_LPARAM(l), y = GET_Y_LPARAM(l);
    if (hit(rClose, x, y)) {
      DestroyWindow(hwnd);
      return 0;
    }
    if (hit(rCheck, x, y)) on_check();
    if (hit(rDown, x, y)) on_down();
    return 0;
  }
  case WM_KEYDOWN:
    if (w == VK_ESCAPE) DestroyWindow(hwnd);
    return 0;
  case WM_DESTROY:
    PostQuitMessage(0);
    return 0;
  }
  return DefWindowProcW(hwnd, m, w, l);
}

int WINAPI wWinMain(HINSTANCE inst, HINSTANCE, PWSTR cmd, int) {
  gInst = inst;
  InitializeCriticalSection(&gCs);
  SetProcessDPIAware();
  wchar_t mod[MAX_PATH];
  GetModuleFileNameW(0, mod, MAX_PATH);
  wchar_t *sl = wcsrchr(mod, L'\\');
  if (sl) *sl = 0;
  wcsncpy(gRoot, mod, MAX_PATH);
  read_local();
  gInstalled = installed();
  if (!gInstalled)
    wcsncpy(gStatus, L"Aura is not in this folder. Check Update, then Download — files unpack next to this exe.", 399);

  if (cmd && wcsstr(cmd, L"--update")) gAuto = 1;

  WNDCLASSW wc;
  ZeroMemory(&wc, sizeof(wc));
  wc.lpfnWndProc = wnd;
  wc.hInstance = inst;
  wc.hCursor = LoadCursor(0, IDC_ARROW);
  wc.hbrBackground = CreateSolidBrush(COL_BG);
  wc.lpszClassName = L"AuraSetup";
  wc.hIcon = LoadIconW(inst, MAKEINTRESOURCEW(1));
  RegisterClassW(&wc);

  int sw = GetSystemMetrics(SM_CXSCREEN), sh = GetSystemMetrics(SM_CYSCREEN);
  int x = (sw - 500) / 2, y = (sh - 450) / 2;
  HWND hwnd = CreateWindowExW(
      WS_EX_APPWINDOW, L"AuraSetup", L"Aura",
      WS_POPUP | WS_VISIBLE,
      x, y, 500, 450, 0, 0, inst, 0);
  gHwnd = hwnd;
  ShowWindow(hwnd, SW_SHOWNORMAL);
  UpdateWindow(hwnd);
  if (gAuto) on_check();

  MSG msg;
  while (GetMessageW(&msg, 0, 0, 0)) {
    TranslateMessage(&msg);
    DispatchMessageW(&msg);
    if (gAuto && gState == ST_READY) {
      gAuto = 0;
      on_down();
    }
  }
  DeleteCriticalSection(&gCs);
  return 0;
}
