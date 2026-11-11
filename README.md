# Welcome to your Expo app 👋

This is an [Expo](https://expo.dev) project created with [`create-expo-app`](https://www.npmjs.com/package/create-expo-app).

## Get started

1. Install dependencies

   ```bash
   npm install
   ```

2. Start the app

   ```bash
   npx expo start
   ```

## Local multiplayer

In the installed Android or iOS app, choose **Local Multiplayer → Host Match →
Start hosting**. The host phone starts the lobby server and displays its LAN IP
in the game screen. On another phone connected to the same Wi-Fi or hotspot,
choose **Join Match** and enter that IP. Internet access and a separate computer
are not required. Keep the host app open while playing.

Phone hosting requires a development or release build that includes the native
TCP socket module; Expo Go does not include it. Rebuild and reinstall after
installing the networking dependencies or changing native settings in
`app.json`.

### Windows Node server (legacy / backend testing)

The standalone Node.js server is still included and can run on Windows. From
PowerShell in the project folder, run `npm install` once, then start it with
`npm run multiplayer:server`. Leave that terminal open while testing. Check
that it is up by opening `http://localhost:8765/health` on the same computer;
from another device, use `http://<Windows-PC-LAN-IP>:8765/health` instead.
Find the PC's address with `ipconfig` under the active Wi-Fi adapter, and allow
inbound TCP port 8765 through Windows Firewall if testing across the LAN.

This script speaks the older WebSocket protocol. It is useful for backend tests
or clients that still use that protocol, but it is **not compatible with the
current installed mobile app's phone-hosted TCP protocol**. For current
Android/iOS multiplayer tests, use the phone-hosting steps above.

In the output, you'll find options to open the app in a

- [development build](https://docs.expo.dev/develop/development-builds/introduction/)
- [Android emulator](https://docs.expo.dev/workflow/android-studio-emulator/)
- [iOS simulator](https://docs.expo.dev/workflow/ios-simulator/)
- [Expo Go](https://expo.dev/go), a limited sandbox for trying out app development with Expo

You can start developing by editing the files inside the **src/app** directory. This project uses [file-based routing](https://docs.expo.dev/router/introduction).

## Get a fresh project

When you're ready, run:

```bash
npm run reset-project
```

This command will move the starter code to the **example** directory and create a blank **src/app** directory where you can start developing.

### Other setup steps

- To set up ESLint for linting, run `npx expo lint`, or follow our guide on ["Using ESLint and Prettier"](https://docs.expo.dev/guides/using-eslint/)
- If you'd like to set up unit testing, follow our guide on ["Unit Testing with Jest"](https://docs.expo.dev/develop/unit-testing/)
- Learn more about the TypeScript setup in this template in our guide on ["Using TypeScript"](https://docs.expo.dev/guides/typescript/)

## Learn more

To learn more about developing your project with Expo, look at the following resources:

- [Expo documentation](https://docs.expo.dev/): Learn fundamentals, or go into advanced topics with our [guides](https://docs.expo.dev/guides).
- [Learn Expo tutorial](https://docs.expo.dev/tutorial/introduction/): Follow a step-by-step tutorial where you'll create a project that runs on Android, iOS, and the web.

## Join the community

Join our community of developers creating universal apps.

- [Expo on GitHub](https://github.com/expo/expo): View our open source platform and contribute.
- [Discord community](https://chat.expo.dev): Chat with Expo users and ask questions.
