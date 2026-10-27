using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

static class CatTheme {
 public static readonly Color Background=ColorTranslator.FromHtml("#ECEAF4"), Ink=ColorTranslator.FromHtml("#30273A"),
  Muted=ColorTranslator.FromHtml("#776E86"), Plum=ColorTranslator.FromHtml("#342B43"), Lilac=ColorTranslator.FromHtml("#DBD4EC"),
  Accent=ColorTranslator.FromHtml("#E97852"), Green=ColorTranslator.FromHtml("#337A65"), Line=ColorTranslator.FromHtml("#E7E1EE");
 public static Font Font(float size,bool bold=false){return new Font("Microsoft YaHei UI",size,bold?FontStyle.Bold:FontStyle.Regular);}
 public static GraphicsPath Round(Rectangle r,int radius){var p=new GraphicsPath();int d=radius*2;p.AddArc(r.X,r.Y,d,d,180,90);p.AddArc(r.Right-d,r.Y,d,d,270,90);p.AddArc(r.Right-d,r.Bottom-d,d,d,0,90);p.AddArc(r.X,r.Bottom-d,d,d,90,90);p.CloseFigure();return p;}
 public static Label Label(string text,float size,Color color,bool bold=false){return new Label{Text=text,Font=Font(size,bold),ForeColor=color,AutoSize=false,AutoEllipsis=true,TextAlign=ContentAlignment.MiddleLeft,Dock=DockStyle.Fill,Margin=Padding.Empty};}
}
class CatPanel:Panel {
 public Color Fill=Color.White;public Color Stroke=CatTheme.Line;
 public CatPanel(){SetStyle(ControlStyles.SupportsTransparentBackColor,true);DoubleBuffered=true;BackColor=Color.Transparent;Padding=new Padding(18);}
 protected override void OnPaint(PaintEventArgs e){e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;using(var path=CatTheme.Round(new Rectangle(0,0,Width-1,Height-1),16)){using(var b=new SolidBrush(Fill))e.Graphics.FillPath(b,path);using(var pen=new Pen(Stroke))e.Graphics.DrawPath(pen,path);}base.OnPaint(e);}
}
class CatButton:Button {
 public Color Fill=Color.White,Ink=CatTheme.Ink,Border=CatTheme.Line;bool hover;
 public CatButton(){SetStyle(ControlStyles.SupportsTransparentBackColor,true);FlatStyle=FlatStyle.Flat;FlatAppearance.BorderSize=0;BackColor=Color.Transparent;UseVisualStyleBackColor=false;Font=CatTheme.Font(10,true);Cursor=Cursors.Hand;Height=42;AccessibleRole=AccessibleRole.PushButton;SetStyle(ControlStyles.UserPaint|ControlStyles.OptimizedDoubleBuffer,true);}
 protected override void OnResize(EventArgs e){base.OnResize(e);if(Width<24||Height<24)return;using(var path=CatTheme.Round(new Rectangle(0,0,Width,Height),11)){var old=Region;Region=new Region(path);if(old!=null)old.Dispose();}}
 protected override void OnMouseEnter(EventArgs e){hover=true;Invalidate();base.OnMouseEnter(e);}
 protected override void OnMouseLeave(EventArgs e){hover=false;Invalidate();base.OnMouseLeave(e);}
 protected override void OnPaint(PaintEventArgs e){e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;var fill=Enabled?(hover?ControlPaint.Light(Fill,.08f):Fill):CatTheme.Line;using(var path=CatTheme.Round(new Rectangle(0,0,Width-1,Height-1),11)){using(var b=new SolidBrush(fill))e.Graphics.FillPath(b,path);using(var pen=new Pen(Border))e.Graphics.DrawPath(pen,path);}TextRenderer.DrawText(e.Graphics,Text,Font,ClientRectangle,Enabled?Ink:CatTheme.Muted,TextFormatFlags.HorizontalCenter|TextFormatFlags.VerticalCenter|TextFormatFlags.EndEllipsis);if(Focused)ControlPaint.DrawFocusRectangle(e.Graphics,Rectangle.Inflate(ClientRectangle,-5,-5),Ink,fill);}
}
class CatAvatar:Control {
 readonly Image image;
 public CatAvatar(Image value){SetStyle(ControlStyles.SupportsTransparentBackColor,true);image=value;DoubleBuffered=true;BackColor=Color.Transparent;AccessibleName="耄耋头像";}
 protected override void OnPaint(PaintEventArgs e){e.Graphics.SmoothingMode=SmoothingMode.AntiAlias;int d=Math.Min(Width,Height)-8;var box=new Rectangle((Width-d)/2,4,d,d);using(var rim=new SolidBrush(CatTheme.Accent))e.Graphics.FillEllipse(rim,box);box.Inflate(-5,-5);var state=e.Graphics.Save();using(var clip=new GraphicsPath()){clip.AddEllipse(box);e.Graphics.SetClip(clip);e.Graphics.InterpolationMode=InterpolationMode.HighQualityBicubic;e.Graphics.DrawImage(image,box);}e.Graphics.Restore(state);}
}
class GroupState {
 public string groupId{get;set;}public bool enabled{get;set;}public bool wildMode{get;set;}public int spice{get;set;}
 public bool stickersEnabled{get;set;}public bool settingsKnown{get;set;}
}
class Dashboard {
 public bool listenerRunning{get;set;}public bool? online{get;set;}public bool? accountMatches{get;set;}
 public string error{get;set;}public string checkedAt{get;set;}public List<GroupState> groups{get;set;}public List<string> warnings{get;set;}
}
class GroupCard:CatPanel {
 readonly Label group,status,mode,sticker;
 public GroupCard(){
  var grid=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=4,BackColor=Color.Transparent,Margin=Padding.Empty};
  grid.RowStyles.Add(new RowStyle(SizeType.Absolute,25));grid.RowStyles.Add(new RowStyle(SizeType.Absolute,30));grid.RowStyles.Add(new RowStyle(SizeType.Absolute,26));grid.RowStyles.Add(new RowStyle(SizeType.Percent,100));
  group=CatTheme.Label("QQ群",10,CatTheme.Muted);status=CatTheme.Label("读取中",14,CatTheme.Ink,true);mode=CatTheme.Label("",9.5f,CatTheme.Ink);sticker=CatTheme.Label("",9,CatTheme.Muted);
  grid.Controls.Add(group,0,0);grid.Controls.Add(status,0,1);grid.Controls.Add(mode,0,2);grid.Controls.Add(sticker,0,3);Controls.Add(grid);
 }
 public void ShowState(GroupState state,bool ready){
  group.Text="QQ群  "+state.groupId;
  status.Text=!state.settingsKnown?"设置暂不可读":!state.enabled?"已暂停":ready?"回复已开启":"已设开启 · 等待连接";
  status.ForeColor=state.settingsKnown&&state.enabled&&ready?CatTheme.Green:CatTheme.Muted;
  mode.Text="火力 "+state.spice+"   /   "+(state.wildMode?"自动接话":"普通互动");
  sticker.Text=!state.stickersEnabled?"随机配图已关闭":state.spice==0?"温顺档 · 纯文字回复":"随机配图已开启";
  if(!state.settingsKnown){mode.Text="刷新后重试";sticker.Text="";}
  AccessibleName=group.Text+"，"+status.Text+"，"+mode.Text+"，"+sticker.Text;
 }
}
class Launcher:Form {
 readonly string root=AppDomain.CurrentDomain.BaseDirectory;
 readonly List<CatButton> actions=new List<CatButton>();
 readonly List<GroupCard> cards=new List<GroupCard>();
 readonly System.Windows.Forms.Timer timer=new System.Windows.Forms.Timer();
 readonly ToolTip tips=new ToolTip();
 readonly RichTextBox log=new RichTextBox();
 readonly Label connection,subtitle,checkedAt,serviceLabel,groupCount;
 readonly FlowLayoutPanel groupFlow;
 readonly CatButton startButton,stopButton,refreshButton;
 bool busy,refreshing,closing;
 Image avatarImage;
 public Launcher(){
  Text="耄耋 · 猫猫控制台";ClientSize=new Size(990,650);MinimumSize=new Size(920,630);StartPosition=FormStartPosition.CenterScreen;
  AutoScaleMode=AutoScaleMode.None;Font=CatTheme.Font(9.5f);BackColor=CatTheme.Background;
  Icon=System.Drawing.Icon.ExtractAssociatedIcon(Application.ExecutablePath);ShowIcon=true;
  avatarImage=Icon.ToBitmap();
  var localAvatar=Path.Combine(root,"outputs","快捷方式图标","耄耋头像.png");
  if(File.Exists(localAvatar)){try{using(var source=Image.FromFile(localAvatar)){var replacement=new Bitmap(source);avatarImage.Dispose();avatarImage=replacement;}}catch{}}
  var layout=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=3,RowCount=1,Padding=new Padding(20),BackColor=CatTheme.Background};
  layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,210));layout.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,20));layout.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));
  var sidebar=new CatPanel{Dock=DockStyle.Fill,Fill=CatTheme.Plum,Stroke=CatTheme.Plum,Padding=new Padding(18),Margin=Padding.Empty};
  var side=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=11,BackColor=Color.Transparent,Margin=Padding.Empty};
  foreach(int height in new[]{128,38,25,37,18,46,46,46,46})side.RowStyles.Add(new RowStyle(SizeType.Absolute,height));
  side.RowStyles.Add(new RowStyle(SizeType.Percent,100));side.RowStyles.Add(new RowStyle(SizeType.Absolute,56));
  side.Controls.Add(new CatAvatar(avatarImage){Dock=DockStyle.Fill,Margin=Padding.Empty},0,0);
  var name=CatTheme.Label("耄耋",23,Color.White,true);name.TextAlign=ContentAlignment.MiddleCenter;side.Controls.Add(name,0,1);
  var english=CatTheme.Label("M A O D I E",9,CatTheme.Lilac);english.TextAlign=ContentAlignment.MiddleCenter;side.Controls.Add(english,0,2);
  var greeting=CatTheme.Label("哈！猫猫在这儿。",10,ColorTranslator.FromHtml("#F5BC9E"));greeting.TextAlign=ContentAlignment.MiddleCenter;side.Controls.Add(greeting,0,3);
  side.Controls.Add(Nav("机器人配置",OpenConfig),0,5);side.Controls.Add(Nav("扫码登录",ShowQr),0,6);side.Controls.Add(Nav("安装更新",InstallUpdate),0,7);side.Controls.Add(Nav("打开日志文件夹",OpenLogs),0,8);
  var sideNote=CatTheme.Label("本机运行 · 手动掌控\n音效与表情继续使用本地库",8.5f,CatTheme.Lilac);sideNote.TextAlign=ContentAlignment.BottomLeft;side.Controls.Add(sideNote,0,10);sidebar.Controls.Add(side);
  var main=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=1,RowCount=7,Margin=Padding.Empty,BackColor=Color.Transparent};
  foreach(int h in new[]{84,58,35,150,36})main.RowStyles.Add(new RowStyle(SizeType.Absolute,h));main.RowStyles.Add(new RowStyle(SizeType.Percent,100));main.RowStyles.Add(new RowStyle(SizeType.Absolute,30));
  var heading=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=3,Margin=Padding.Empty,BackColor=Color.Transparent};
  heading.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));heading.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,150));heading.RowStyles.Add(new RowStyle(SizeType.Absolute,34));heading.RowStyles.Add(new RowStyle(SizeType.Absolute,26));heading.RowStyles.Add(new RowStyle(SizeType.Percent,100));
  connection=CatTheme.Label("看看耄耋醒了没",20,CatTheme.Ink,true);subtitle=CatTheme.Label("正在检查QQ与机器人服务…",9.5f,CatTheme.Muted);checkedAt=CatTheme.Label("尚未检查",8.5f,CatTheme.Muted);checkedAt.TextAlign=ContentAlignment.TopRight;
  serviceLabel=CatTheme.Label("服务检查中",9.5f,CatTheme.Muted,true);serviceLabel.TextAlign=ContentAlignment.MiddleRight;
  heading.Controls.Add(connection,0,0);heading.Controls.Add(serviceLabel,1,0);heading.Controls.Add(subtitle,0,1);heading.SetColumnSpan(subtitle,2);heading.Controls.Add(checkedAt,1,2);
  var actionRow=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=false,Margin=Padding.Empty,BackColor=Color.Transparent};
  startButton=MakeButton("启动耄耋",async()=>await RunAction("start","启动服务"),true);stopButton=MakeButton("停止服务",async()=>await RunAction("stop","停止服务"),false);refreshButton=MakeButton("刷新状态",async()=>await RefreshDashboard(true),false);
  startButton.Width=140;stopButton.Width=122;refreshButton.Width=122;actionRow.Controls.Add(startButton);actionRow.Controls.Add(stopButton);actionRow.Controls.Add(refreshButton);
  tips.SetToolTip(stopButton,"仅停止机器人服务，QQ登录和群开关会保留。");tips.SetToolTip(refreshButton,"只读取本机状态，不调用模型，不向群里发消息。");
  var groupsHeading=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=1,Margin=Padding.Empty};groupsHeading.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));groupsHeading.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,170));
  groupsHeading.Controls.Add(CatTheme.Label("群聊状态",12,CatTheme.Ink,true),0,0);groupCount=CatTheme.Label("",8.5f,CatTheme.Muted);groupCount.TextAlign=ContentAlignment.MiddleRight;groupsHeading.Controls.Add(groupCount,1,0);
  groupFlow=new FlowLayoutPanel{Dock=DockStyle.Fill,WrapContents=true,AutoScroll=true,Margin=Padding.Empty,BackColor=Color.Transparent};groupFlow.SizeChanged+=(s,e)=>SizeCards();
  var logHeading=new TableLayoutPanel{Dock=DockStyle.Fill,ColumnCount=2,RowCount=1,Margin=Padding.Empty};logHeading.ColumnStyles.Add(new ColumnStyle(SizeType.Percent,100));logHeading.ColumnStyles.Add(new ColumnStyle(SizeType.Absolute,220));
  logHeading.Controls.Add(CatTheme.Label("运行记录",12,CatTheme.Ink,true),0,0);var logHint=CatTheme.Label("仅显示本次打开后的操作",8.5f,CatTheme.Muted);logHint.TextAlign=ContentAlignment.MiddleRight;logHeading.Controls.Add(logHint,1,0);
  var logPanel=new CatPanel{Dock=DockStyle.Fill,Margin=Padding.Empty,Padding=new Padding(14)};
  log.ReadOnly=true;log.BorderStyle=BorderStyle.None;log.BackColor=Color.White;log.ForeColor=CatTheme.Ink;log.Font=CatTheme.Font(9.5f);log.Dock=DockStyle.Fill;log.ScrollBars=RichTextBoxScrollBars.Vertical;log.DetectUrls=false;log.TabStop=true;log.AccessibleName="运行记录";logPanel.Controls.Add(log);
  var footer=CatTheme.Label("关闭这个窗口，耄耋仍会继续运行。",8.5f,CatTheme.Muted);footer.TextAlign=ContentAlignment.BottomLeft;
  main.Controls.Add(heading,0,0);main.Controls.Add(actionRow,0,1);main.Controls.Add(groupsHeading,0,2);main.Controls.Add(groupFlow,0,3);main.Controls.Add(logHeading,0,4);main.Controls.Add(logPanel,0,5);main.Controls.Add(footer,0,6);
  layout.Controls.Add(sidebar,0,0);layout.Controls.Add(main,2,0);Controls.Add(layout);
  Shown+=async(s,e)=>{AppendLog("耄耋","控制台已打开，正在确认运行状态。",false);await RunAction("start","启动服务");timer.Start();};
  timer.Interval=30000;timer.Tick+=async(s,e)=>{if(!busy&&!refreshing)await RefreshDashboard(false);};
  FormClosing+=(s,e)=>{closing=true;timer.Stop();};
 }
 CatButton Nav(string text,Action action){var b=new CatButton{Text=text,Dock=DockStyle.Fill,Margin=new Padding(0,3,0,3),Fill=ColorTranslator.FromHtml("#463C55"),Ink=Color.White,Border=ColorTranslator.FromHtml("#594D69")};b.Click+=(s,e)=>{try{action();}catch{AppendLog("提示","操作未完成，请打开日志检查。",true);}};actions.Add(b);return b;}
 CatButton MakeButton(string text,Func<Task> action,bool primary){var b=new CatButton{Text=text,Margin=new Padding(0,4,10,10),Fill=primary?CatTheme.Accent:Color.White,Ink=primary?Color.White:CatTheme.Ink,Border=primary?CatTheme.Accent:CatTheme.Line};b.Click+=async(s,e)=>await action();actions.Add(b);return b;}
 void SetBusy(bool value){busy=value;foreach(var button in actions)button.Enabled=!value;}
 void SizeCards(){int count=cards.Count;int columns=count>1&&groupFlow.ClientSize.Width>=480?2:1;int width=Math.Max(200,(groupFlow.ClientSize.Width-(columns>1?12:0)-SystemInformation.VerticalScrollBarWidth)/columns);foreach(var card in cards){card.Width=width;card.Height=140;}}
 void PaintSnapshot(Dashboard value){
  bool ready=value.listenerRunning&&value.online==true&&value.accountMatches==true;
  connection.Text=ready?"耄耋在岗，喵。":!value.listenerRunning?"耄耋服务已停止":value.accountMatches==false?"QQ账号需要核对":"耄耋在等QQ上线";
  connection.ForeColor=ready?CatTheme.Ink:CatTheme.Muted;
  serviceLabel.Text=value.listenerRunning?"● 服务运行中":"○ 服务已停止";serviceLabel.ForeColor=value.listenerRunning?CatTheme.Green:CatTheme.Muted;
  subtitle.Text=!String.IsNullOrEmpty(value.error)?value.error:value.accountMatches==false?"请登录配置中的机器人QQ号，再刷新状态。":!value.listenerRunning?"点“启动耄耋”恢复服务，已保存的群开关会保留。":value.online==true?"QQ已连接 · 群开关在下方一眼看清":"请扫码登录QQ，完成后点“刷新状态”。";
  if(value.warnings!=null&&value.warnings.Count>0)subtitle.Text=value.warnings[0];
  checkedAt.Text="刚刚检查  "+DateTime.Now.ToString("HH:mm:ss");
  groupCount.Text="每30秒刷新 · "+(value.groups==null?0:value.groups.Count)+"个群";
  foreach(var card in cards)card.Dispose();cards.Clear();groupFlow.Controls.Clear();
  if(value.groups!=null)foreach(var state in value.groups){var card=new GroupCard{Margin=new Padding(0,0,12,10)};card.ShowState(state,ready);cards.Add(card);groupFlow.Controls.Add(card);}
  if(cards.Count==0){var empty=CatTheme.Label("暂无可显示的群，请检查机器人配置。",10,CatTheme.Muted);empty.Size=new Size(450,60);groupFlow.Controls.Add(empty);}
  SizeCards();
 }
 async Task RefreshDashboard(bool manual){
  if(refreshing||closing)return;refreshing=true;refreshButton.Enabled=false;
  try{
   var result=await Task.Run(()=>Shell(Path.Combine(root,"app","windows","manage.ps1")," -Action snapshot"));if(closing)return;
   if(result.Item1!=0)throw new Exception();var value=new JavaScriptSerializer().Deserialize<Dashboard>(result.Item2.Trim());if(value==null)throw new Exception();PaintSnapshot(value);
   if(manual)AppendLog("状态",value.listenerRunning&&value.online==true?"QQ已在线，群设置已刷新。":!String.IsNullOrEmpty(value.error)?value.error:"当前服务或QQ未就绪，请查看上方提示。",value.online!=true);
  }catch{if(!closing){PaintSnapshot(new Dashboard{groups=new List<GroupState>(),warnings=new List<string>(),error="状态暂时无法读取，请稍后刷新。"});connection.Text="状态暂不可用";serviceLabel.Text="尚未确认";if(manual)AppendLog("状态","检查未完成，可打开日志查看详情。",true);}}
  finally{refreshing=false;if(!closing)refreshButton.Enabled=!busy;}
 }
 async Task RunAction(string action,string label){if(busy)return;SetBusy(true);AppendLog("操作",label+"…",false);try{var result=await Task.Run(()=>Shell(Path.Combine(root,"app","windows","manage.ps1")," -Action "+action));if(closing)return;StoreOutput(label,result);AppendLog(label,result.Item1==0?(action=="start"?"耄耋服务已就绪。":"服务已停止，QQ登录和群开关已保留。 "):"操作未完成，请打开日志检查本机服务。",result.Item1!=0);await RefreshDashboard(false);}catch{if(!closing)AppendLog(label,"操作未完成，请打开日志查看详情。",true);}finally{if(!closing)SetBusy(false);}}
 void AppendLog(string tag,string message,bool error){if(closing)return;if(log.TextLength>24000)log.Clear();log.SelectionStart=log.TextLength;log.SelectionColor=CatTheme.Muted;log.AppendText(DateTime.Now.ToString("HH:mm:ss")+"  ");log.SelectionColor=error?CatTheme.Accent:CatTheme.Green;log.AppendText(tag+"  ");log.SelectionColor=CatTheme.Ink;log.AppendText(message+Environment.NewLine);log.ScrollToCaret();}
 void OpenConfig(){Process.Start(new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -File "+Q(Path.Combine(root,"app","setup.ps1"))){UseShellExecute=true});AppendLog("配置","已打开本机配置窗口；保存后重启服务生效。",false);}
 void ShowQr(){var qr=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"QQFanGu","napcat","cache","qrcode.png");if(File.Exists(qr)){Process.Start(new ProcessStartInfo(qr){UseShellExecute=true});AppendLog("登录","已打开本机QQ登录二维码。",false);}else AppendLog("登录","暂时没有二维码，请先启动服务并查看QQ登录日志。",true);}
 void OpenLogs(){var path=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"QQFanGu","logs");if(!Directory.Exists(path))Directory.CreateDirectory(path);Process.Start("explorer.exe",Q(path));}
 async void InstallUpdate(){if(busy)return;using(var d=new OpenFileDialog{Filter="耄耋更新包 (*.zip)|*.zip"}){if(d.ShowDialog()!=DialogResult.OK)return;SetBusy(true);AppendLog("更新","正在安装所选更新包…",false);try{var result=await Task.Run(()=>Shell(Path.Combine(root,"app","windows","update.ps1")," -Package "+Q(d.FileName)+" -InstallRoot "+Q(root.TrimEnd(Path.DirectorySeparatorChar))));StoreOutput("安装更新",result);if(!closing)AppendLog("更新",result.Item1==0?"更新完成，旧程序已送回收站。":"更新未完成，已保留或恢复旧版；请查看日志。",result.Item1!=0);await RefreshDashboard(false);}catch{if(!closing)AppendLog("更新","更新未完成，请打开日志检查。",true);}finally{if(!closing)SetBusy(false);}}}
 void StoreOutput(string label,Tuple<int,string> result){if(result.Item1==0)return;try{var path=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"QQFanGu","logs");Directory.CreateDirectory(path);File.AppendAllText(Path.Combine(path,"launcher.log"),DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss")+" "+label+Environment.NewLine+result.Item2+Environment.NewLine);}catch{}}
 static string Q(string v){if(v.Contains("\""))throw new Exception("Invalid path");return "\""+v+"\"";}
 static Tuple<int,string> Shell(string file,string args){var info=new ProcessStartInfo("powershell.exe","-NoProfile -ExecutionPolicy Bypass -File "+Q(file)+args){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=System.Text.Encoding.UTF8,StandardErrorEncoding=System.Text.Encoding.UTF8};using(var p=Process.Start(info)){var stdout=p.StandardOutput.ReadToEndAsync();var stderr=p.StandardError.ReadToEndAsync();p.WaitForExit();Task.WaitAll(stdout,stderr);return Tuple.Create(p.ExitCode,stdout.Result+stderr.Result);}}
 protected override void Dispose(bool disposing){if(disposing){timer.Dispose();tips.Dispose();if(avatarImage!=null){avatarImage.Dispose();avatarImage=null;}}base.Dispose(disposing);}
 [STAThread]static int Main(string[] args){try{Application.EnableVisualStyles();Application.SetCompatibleTextRenderingDefault(false);
  var root=AppDomain.CurrentDomain.BaseDirectory;
  if(args.Length>0){if(args[0]=="--self-test")return File.Exists(Path.Combine(root,"app","windows","manage.ps1"))?0:2;string action=args[0].TrimStart('-');if(action!="start"&&action!="stop"&&action!="status"&&action!="check")return 2;return Shell(Path.Combine(root,"app","windows","manage.ps1")," -Action "+action).Item1;}
  Application.Run(new Launcher());return 0;
 }catch(Exception e){MessageBox.Show(e.Message,"耄耋启动失败");return 1;}}
}
