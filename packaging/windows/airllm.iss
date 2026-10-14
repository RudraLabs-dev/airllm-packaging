; Inno Setup 6 script for the AirLLM Windows installer.
; Built by CI:  iscc /DAppVersion=4.0.0-1 /DNumericVersion=4.0.0.1 /DSourceDir=build\stage /DOutputDir=dist packaging\windows\airllm.iss
;
; Silent install:   AirLLM-<ver>-setup-x64.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART [/DIR="D:\AirLLM"] [/CURRENTUSER] [/TASKS=""]
; Silent uninstall: "%ProgramFiles%\AirLLM\unins000.exe" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART

#ifndef AppVersion
  #define AppVersion "0.0.0-0"
#endif
#ifndef NumericVersion
  #define NumericVersion "0.0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\..\build\stage"
#endif
#ifndef OutputDir
  #define OutputDir "..\..\dist"
#endif

[Setup]
; Never change AppId: Windows uses it to recognise upgrades of the same product.
AppId={{50300B08-0449-49D6-8548-AEAB8C54BFD5}
AppName=AirLLM
AppVersion={#AppVersion}
AppVerName=AirLLM {#AppVersion}
AppPublisher=RudraLabs
AppPublisherURL=https://github.com/RudraLabs-dev/airllm-packaging
AppSupportURL=https://github.com/RudraLabs-dev/airllm-packaging/issues
AppUpdatesURL=https://github.com/RudraLabs-dev/airllm-packaging/releases
VersionInfoVersion={#NumericVersion}
VersionInfoProductVersion={#NumericVersion}
VersionInfoDescription=AirLLM installer
DefaultDirName={autopf}\AirLLM
DefaultGroupName=AirLLM
DisableProgramGroupPage=yes
LicenseFile={#SourceDir}\LICENSE.txt
OutputDir={#OutputDir}
OutputBaseFilename=AirLLM-{#AppVersion}-setup-x64
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
; Admin (all users) by default; "/CURRENTUSER" or the dialog allows a per-user install.
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog commandline
ChangesEnvironment=yes
UninstallDisplayName=AirLLM {#AppVersion}
WizardStyle=modern
; ~1.5 GB of mostly binaries: solid LZMA2 on several threads keeps CI time reasonable.
Compression=lzma2/normal
SolidCompression=yes
LZMAUseSeparateProcess=yes
LZMANumBlockThreads=4

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "addtopath"; Description: "Add AirLLM to PATH (airllm-python, airllm-enable-cuda)"; GroupDescription: "Command line:"

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\AirLLM Command Prompt"; Filename: "{cmd}"; Parameters: "/k ""{app}\airllm-shell.cmd"""; WorkingDir: "{userdocs}"
Name: "{group}\Uninstall AirLLM"; Filename: "{uninstallexe}"

[UninstallDelete]
; Files created after install: the optional CUDA overlay and runtime .pyc caches.
Type: filesandordirs; Name: "{app}\cuda-site"
Type: filesandordirs; Name: "{app}\cuda-site.new"
Type: filesandordirs; Name: "{app}\python"
Type: dirifempty; Name: "{app}"

[Code]
function EnvRoot: Integer;
begin
  if IsAdminInstallMode then Result := HKEY_LOCAL_MACHINE else Result := HKEY_CURRENT_USER;
end;

function EnvKey: String;
begin
  if IsAdminInstallMode then
    Result := 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment'
  else
    Result := 'Environment';
end;

procedure AddToPath(Dir: String);
var
  Paths: String;
begin
  if not RegQueryStringValue(EnvRoot, EnvKey, 'Path', Paths) then Paths := '';
  if Pos(';' + Uppercase(Dir) + ';', ';' + Uppercase(Paths) + ';') > 0 then Exit;
  if (Paths <> '') and (Copy(Paths, Length(Paths), 1) <> ';') then Paths := Paths + ';';
  RegWriteExpandStringValue(EnvRoot, EnvKey, 'Path', Paths + Dir);
end;

procedure RemoveFromPath(Dir: String);
var
  Paths: String;
  P: Integer;
begin
  if not RegQueryStringValue(EnvRoot, EnvKey, 'Path', Paths) then Exit;
  Paths := ';' + Paths + ';';
  P := Pos(';' + Uppercase(Dir) + ';', Uppercase(Paths));
  if P = 0 then Exit;
  Delete(Paths, P, Length(Dir) + 1);
  if Length(Paths) >= 2 then Paths := Copy(Paths, 2, Length(Paths) - 2) else Paths := '';
  RegWriteExpandStringValue(EnvRoot, EnvKey, 'Path', Paths);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if (CurStep = ssPostInstall) and WizardIsTaskSelected('addtopath') then
    AddToPath(ExpandConstant('{app}'));
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usPostUninstall then
    RemoveFromPath(ExpandConstant('{app}'));
end;
