import smtplib
import getpass
from email.mime.text import MIMEText
from email.header import Header

# 常用 AWS SES 区域列表
SES_REGIONS = {
    "1": ("ap-northeast-1", "亚太区域 (东京)"),
    "2": ("ap-northeast-2", "亚太区域 (首尔)"),
    "3": ("ap-southeast-1", "亚太区域 (新加坡)"),
    "4": ("us-east-1", "美国东部 (弗吉尼亚北部)"),
    "5": ("us-west-2", "美国西部 (俄勒冈)"),
    "6": ("eu-west-1", "欧洲 (爱尔兰)"),
}

def main():
    print("=" * 50)
    print("      Amazon SES IAM SMTP 发送邮件测试脚本")
    print("=" * 50)

    # 1. 选择 AWS SES 区域
    print("\n[ Step 1: 选择 AWS SES 区域 ]")
    for key, val in SES_REGIONS.items():
        print(f" {key}. {val[1]} ({val[0]})")
    print(" 7. 手动输入其他区域代码 (例如: eu-central-1)")

    region_choice = input("请选择区域序号 (默认 1 - 东京): ").strip()
    if not region_choice:
        region_choice = "1"

    if region_choice in SES_REGIONS:
        aws_region = SES_REGIONS[region_choice][0]
    elif region_choice == "7":
        aws_region = input("请输入 AWS 区域代码: ").strip()
    else:
        aws_region = "ap-northeast-1"

    # 根据区域拼装 SMTP 服务器地址
    smtp_host = f"email-smtp.{aws_region}.amazonaws.com"
    smtp_port = 587  # STARTTLS 常用端口

    print(f"-> 已匹配 SMTP 服务器: {smtp_host}:{smtp_port}")

    # 2. 配置 IAM SMTP 凭证
    print("\n[ Step 2: IAM SMTP 凭证配置 ]")
    smtp_username = input("请输入 SMTP 用户名 (SMTP Username): ").strip()
    # 使用 getpass 隐藏输入的密码，避免明文留存在屏幕上
    smtp_password = getpass.getpass("请输入 SMTP 密码 (SMTP Password): ").strip()

    # 3. 填写邮件内容
    print("\n[ Step 3: 填写邮件信息 ]")
    from_email = input("发件人邮箱 (已在 SES 验证的域名或邮箱): ").strip()
    to_email = input("收件人邮箱: ").strip()
    subject = input("邮件主题: ").strip()
    
    print("\n请输入邮件文本内容 (支持多行，输入完毕后另起一行输入 END 结束):")
    lines = []
    while True:
        line = input()
        if line.strip() == "END":
            break
        lines.append(line)
    body_text = "\n".join(lines)

    # 4. 构建纯文本邮件
    msg = MIMEText(body_text, 'plain', 'utf-8')
    msg['Subject'] = Header(subject, 'utf-8')
    msg['From'] = from_email
    msg['To'] = to_email

    # 5. 连接 SMTP 服务器并发送
    print("\n[ Step 4: 正在发送邮件... ]")
    try:
        # 创建 SMTP 连接
        server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
        server.set_debuglevel(0)  # 如果调试遇到问题，可以改为 1 查看底层的 SMTP 握手日志
        
        # 启用 TLS 安全加密
        server.starttls()
        
        # 登录 SMTP 服务器
        server.login(smtp_username, smtp_password)
        
        # 发送邮件
        server.sendmail(from_email, [to_email], msg.as_string())
        server.quit()

        print("\n" + "★" * 50)
        print(" SUCCESS: 邮件发送成功！请检查收件箱。")
        print("★" * 50)

    except smtplib.SMTPAuthenticationError:
        print("\n❌ 错误: SMTP 身份验证失败！请检查输入的 SMTP 用户名和密码是否正确。")
        print("（注意：请确保使用的是从 SES 创建生成的 SMTP 凭证，而不是 AWS IAM 控制台的 AccessKey/SecretKey。）")
    except Exception as e:
        print(f"\n❌ 发送失败，引发异常: {e}")

if __name__ == "__main__":
    main()