#define UNICODE
#define _UNICODE
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <stdio.h>
#include <string.h>

static void die(const wchar_t *msg) {
  MessageBoxW(NULL, msg, L"Aura", MB_OK | MB_ICONERROR);
  ExitProcess(1);
}

int WINAPI wWinMain(HINSTANCE, HINSTANCE, PWSTR, int) {
  wchar_t root[MAX_PATH];
  DWORD n = GetModuleFileNameW(NULL, root, MAX_PATH);
  if (!n || n >= MAX_PATH)
    die(L"Cannot resolve install path.");
  wchar_t *slash = wcsrchr(root, L'\\');
  if (!slash)
    die(L"Cannot resolve install path.");
  *slash = 0;

  wchar_t engine[MAX_PATH], engineDir[MAX_PATH], profile[MAX_PATH], cmd[2048];
  if (swprintf(engineDir, MAX_PATH, L"%s\\engine", root) < 0)
    die(L"Path too long.");
  if (swprintf(engine, MAX_PATH, L"%s\\AuraBrowser.exe", engineDir) < 0)
    die(L"Path too long.");
  if (swprintf(profile, MAX_PATH, L"%s\\data", root) < 0)
    die(L"Path too long.");
  if (GetFileAttributesW(engine) == INVALID_FILE_ATTRIBUTES)
    die(L"engine\\AuraBrowser.exe is missing.");
  CreateDirectoryW(profile, NULL);

  {
    wchar_t zip[MAX_PATH], pendp[MAX_PATH], appp[MAX_PATH], lock[MAX_PATH];
    swprintf(zip, MAX_PATH, L"%s\\updates\\repo.zip", root);
    swprintf(pendp, MAX_PATH, L"%s\\updates\\pending.sha", root);
    swprintf(appp, MAX_PATH, L"%s\\updates\\applied.sha", root);
    swprintf(lock, MAX_PATH, L"%s\\parent.lock", profile);
    if (GetFileAttributesW(zip) != INVALID_FILE_ATTRIBUTES &&
        GetFileAttributesW(pendp) != INVALID_FILE_ATTRIBUTES) {
      wchar_t pend[80] = {0}, app[80] = {0};
      FILE *f = _wfopen(pendp, L"rt");
      if (f) {
        fgetws(pend, 80, f);
        fclose(f);
      }
      f = _wfopen(appp, L"rt");
      if (f) {
        fgetws(app, 80, f);
        fclose(f);
      }
      wchar_t *nl = wcspbrk(pend, L"\r\n");
      if (nl) *nl = 0;
      nl = wcspbrk(app, L"\r\n");
      if (nl) *nl = 0;
      if (pend[0] && wcscmp(pend, app) != 0) {
        for (int i = 0; i < 40; i++) {
          if (GetFileAttributesW(lock) == INVALID_FILE_ATTRIBUTES) break;
          Sleep(250);
        }
        DeleteFileW(lock);
        wchar_t launcher[MAX_PATH], lcmd[1024];
        swprintf(launcher, MAX_PATH, L"%s\\AuraLauncher.exe", root);
        if (GetFileAttributesW(launcher) != INVALID_FILE_ATTRIBUTES) {
          swprintf(lcmd, 1024, L"\"%s\" --silent", launcher);
          STARTUPINFOW lsi;
          PROCESS_INFORMATION lpi;
          ZeroMemory(&lsi, sizeof(lsi));
          lsi.cb = sizeof(lsi);
          ZeroMemory(&lpi, sizeof(lpi));
          if (CreateProcessW(launcher, lcmd, NULL, NULL, FALSE, 0, NULL, root, &lsi, &lpi)) {
            WaitForSingleObject(lpi.hProcess, 180000);
            CloseHandle(lpi.hThread);
            CloseHandle(lpi.hProcess);
          }
        }
      }
    }
  }

  wchar_t src[MAX_PATH], dst[MAX_PATH], chrome[MAX_PATH];
  swprintf(src, MAX_PATH, L"%s\\engine\\user.js", root);
  swprintf(dst, MAX_PATH, L"%s\\user.js", profile);
  CopyFileW(src, dst, FALSE);
  swprintf(chrome, MAX_PATH, L"%s\\chrome", profile);
  CreateDirectoryW(chrome, NULL);
  swprintf(src, MAX_PATH, L"%s\\engine\\chrome\\userChrome.css", root);
  swprintf(dst, MAX_PATH, L"%s\\userChrome.css", chrome);
  CopyFileW(src, dst, FALSE);
  swprintf(src, MAX_PATH, L"%s\\engine\\chrome\\userContent.css", root);
  swprintf(dst, MAX_PATH, L"%s\\userContent.css", chrome);
  CopyFileW(src, dst, FALSE);

  SetEnvironmentVariableW(L"MOZ_CRASHREPORTER_DISABLE", L"1");
  SetEnvironmentVariableW(L"MOZ_CRASHREPORTER_NO_REPORT", L"1");
  SetEnvironmentVariableW(L"MOZ_DISABLE_AUTO_SAFE_MODE", L"1");
  SetEnvironmentVariableW(L"SSLKEYLOGFILE", NULL);
  SetEnvironmentVariableW(L"MOZ_PLUGIN_PATH", NULL);
  SetEnvironmentVariableW(L"MOZ_PROFILER_STARTUP", NULL);
  SetEnvironmentVariableW(L"MOZ_LOG", NULL);
  SetEnvironmentVariableW(L"MOZ_LOG_FILE", NULL);
  SetEnvironmentVariableW(L"NSPR_LOG_FILE", NULL);
  SetEnvironmentVariableW(L"NSS_DEBUG_PKCS11_MODULE", NULL);
  SetEnvironmentVariableW(L"NSS_DEFAULT_DB_TYPE", NULL);
  SetEnvironmentVariableW(L"MOZ_CHAOSMODE", NULL);
  SetEnvironmentVariableW(L"MOZ_DEBUG_APP_PROCESS_FOR", NULL);

  wchar_t junk[MAX_PATH];
  swprintf(junk, MAX_PATH, L"%s\\parent.lock", profile);
  DeleteFileW(junk);
  swprintf(junk, MAX_PATH, L"%s\\Telemetry.ShutdownTime.txt", profile);
  DeleteFileW(junk);
  swprintf(junk, MAX_PATH, L"%s\\sessionCheckpoints.json", profile);
  DeleteFileW(junk);

  if (swprintf(cmd, 2048,
               L"\"%s\" -no-remote -profile \"%s\"",
               engine, profile) < 0)
    die(L"Command line too long.");

  STARTUPINFOW si;
  PROCESS_INFORMATION pi;
  ZeroMemory(&si, sizeof(si));
  si.cb = sizeof(si);
  ZeroMemory(&pi, sizeof(pi));
  if (!CreateProcessW(engine, cmd, NULL, NULL, FALSE,
                      0, NULL, engineDir, &si, &pi)) {
    wchar_t buf[160];
    swprintf(buf, 160, L"Failed to start Aura. (%lu)", GetLastError());
    die(buf);
  }
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);
  return 0;
}
