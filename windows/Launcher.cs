using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Threading.Tasks;
using System.Windows.Forms;
class Launcher : Form {
 readonly string root=AppDomain.CurrentDomain.BaseDirectory;
 TextBox output=new TextBox();
 FlowLayoutPanel buttons=new FlowLayoutPanel();
 Launcher(){
  Text="耄耋机器人";Size=new Size(650,430);MinimumSize=new Size(600,380);StartPosition=FormStartPosition.CenterScreen;Font=new Font("Microsoft YaHei UI",10);
  Icon=System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);ShowIcon=true;
  var title=new Label{Text="耄耋 · 本机控制台",Dock=DockStyle.Top,Height=52,Padding=new Padding(16),Font=new Font("Microsoft YaHei UI",15,FontStyle.Bold)};
  output.Multiline=true;output.ReadOnly=true;output.ScrollBars=ScrollBars.Vertical;output.Dock=DockStyle.Fill;output.BackColor=Color.White;output.BorderStyle=BorderStyle.FixedSingle;
  buttons.Dock=DockStyle.Top;buttons.Height=88;buttons.Padding=new Padding(8);
  AddAsync("启动",()=>Run("start"));AddAsync("停止服务",()=>Run("stop"));AddAsync("检查状态",()=>Run("status"));
  Add("配置",()=>{Process.Start(new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -File "+Q(Path.Combine(root,"app","setup.ps1"))){UseShellExecute=true});});
  Add("扫码登录",()=>{var qr=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"QQFanGu","napcat","cache","qrcode.png");if(File.Exists(qr))Process.Start(new ProcessStartInfo(qr){UseShellExecute=true});else MessageBox.Show("暂无登录二维码，请查看QQ服务日志。","耄耋");});
  Add("安装更新",InstallUpdate);Add("打开日志",()=>Process.Start("explorer.exe",Q(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"QQFanGu","logs"))));
  var note=new Label{Text="关闭窗口不会停机。停止服务会保留QQ登录和群开关。",Dock=DockStyle.Bottom,Height=36,Padding=new Padding(8)};
  Controls.Add(output);Controls.Add(buttons);Controls.Add(title);Controls.Add(note);
  Shown+=async (s,e)=>{await Run("start");await Run("status");};
 }
 void Add(string title,Action action){var b=new Button{Text=title,AutoSize=true,Height=32,Margin=new Padding(4)};b.Click+=(s,e)=>action();buttons.Controls.Add(b);}
 void AddAsync(string title,Func<Task> action){var b=new Button{Text=title,AutoSize=true,Height=32,Margin=new Padding(4)};b.Click+=async(s,e)=>await action();buttons.Controls.Add(b);}
 static string Q(string v){if(v.Contains("\""))throw new Exception("Invalid path");return "\""+v+"\"";}
 async Task Run(string action){await Execute(Path.Combine(root,"app","windows","manage.ps1")," -Action "+action);}
 async void InstallUpdate(){using(var d=new OpenFileDialog{Filter="耄耋更新包 (*.zip)|*.zip"}){if(d.ShowDialog()!=DialogResult.OK)return;await Execute(Path.Combine(root,"app","windows","update.ps1")," -Package "+Q(d.FileName)+" -InstallRoot "+Q(root.TrimEnd(Path.DirectorySeparatorChar)));}}
 async Task Execute(string file,string args){buttons.Enabled=false;try{output.AppendText("\r\n处理中…\r\n");var result=await Task.Run(()=>Shell(file,args));output.AppendText(result.Item2.Replace("\r\n","\n").Replace("\n",Environment.NewLine)+"\r\n退出码："+result.Item1+"\r\n");}catch(Exception e){output.AppendText(e.Message+"\r\n");}finally{buttons.Enabled=true;}}
 static Tuple<int,string> Shell(string file,string args){var info=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -File "+Q(file)+args){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=System.Text.Encoding.UTF8,StandardErrorEncoding=System.Text.Encoding.UTF8};info.EnvironmentVariables["PYTHONIOENCODING"]="utf-8";using(var p=Process.Start(info)){var stdout=p.StandardOutput.ReadToEndAsync();var stderr=p.StandardError.ReadToEndAsync();p.WaitForExit();Task.WaitAll(stdout,stderr);return Tuple.Create(p.ExitCode,stdout.Result+stderr.Result);}}
 [STAThread]static int Main(string[] args){Application.EnableVisualStyles();try{
  var root=AppDomain.CurrentDomain.BaseDirectory;
  if(args.Length>0){if(args[0]=="--self-test")return File.Exists(Path.Combine(root,"app","windows","manage.ps1"))?0:2;
   string action=args[0].TrimStart('-');if(action!="start"&&action!="stop"&&action!="status"&&action!="check")return 2;
   return Shell(Path.Combine(root,"app","windows","manage.ps1")," -Action "+action).Item1;}
  Application.Run(new Launcher());return 0;
 }catch(Exception e){MessageBox.Show(e.Message,"耄耋启动失败");return 1;}}
}
