# 最简单上线步骤

你现在还没有公网网址。公网网址要等部署平台创建成功后才会生成。

## 你的两个口令

点餐口令，发给她：

```text
填你的 ACCESS_KEY
```

后台口令，只给你自己：

```text
填你的 ADMIN_KEY
```

## 推荐方式

用 Render 部署。它会给你一个类似这样的公网网址：

```text
https://south-campus-order.onrender.com
```

真正生成的网址以 Render 页面显示为准。

## 你需要点什么

1. 打开 Render。
2. 创建一个 Web Service。
3. 选择这个项目所在的 GitHub 仓库。
4. 环境选择 Node。
5. Build Command 填：

```text
npm install
```

6. Start Command 填：

```text
npm start
```

7. 添加环境变量：

```text
ACCESS_KEY=填你的点餐口令
ADMIN_KEY=填你的后台口令
NODE_ENV=production
DATA_DIR=/var/data
```

8. 如果 Render 页面让你添加 Disk，添加一个 1GB 磁盘，挂载路径填：

```text
/var/data
```

## 上线后怎么发链接

假设 Render 给你的网址是：

```text
https://south-campus-order.onrender.com
```

发给她的点餐链接就是：

```text
https://south-campus-order.onrender.com/?key=填你的点餐口令
```

你自己看的后台链接就是：

```text
https://south-campus-order.onrender.com/admin.html?key=填你的后台口令
```

## 注意

不要把后台链接发给别人。

如果你改了两个口令，旧链接会失效，需要重新发新链接。
