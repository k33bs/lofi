<p align="center">
  <img height="64" src="https://raw.githubusercontent.com/dvx/lofi/master/icon.png">
</p>

<h1 align="center"><strong>Lofi: a tiny Spotify player</strong></h1>

<p align="center">
  <a target="_blank" href="https://www.lofi.rocks">Website</a> • <a target="_blank" href="https://www.lofi.rocks/help">FAQ</a> • <a target="_blank" href="https://discord.gg/YuH9UJk">Discord</a>
</p>

<table width="100%">
  <tr>
    <td width="50%"><img width="100%" src="https://www.lofi.rocks/min.jpg"></td>
    <td width="50%"><img width="100%" src="https://www.lofi.rocks/vis.gif"></td>
  </tr>
</table>

Lofi is a mini Spotify player with visualizations. It is _not_ a replacement for the Spotify Desktop app, nor does it play music independently of the Spotify app; instead, Lofi works alongside it to provide a more intuitive and pleasant access to common features. Lofi also displays cover art and track info stylishly and it facilitates WebGL-powered audio visualizations for both Windows, MacOS and Linux. In other words, it's a "tiny Spotify player" or a "mini mode" to enhance the Spotify desktop app.

## Design goals

- A small, `1:1` aspect ratio player depicting album art
- An always-on-top "widget-like" app
- Minimalist (no extraneous controls)
- Multiple-screen capable
- Windows, MacOS and Linux compatible
- Visualization-ready (WebGL)
- ≤ 100MB memory footprint

# Connecting to Spotify

Spotify's Web API rules no longer allow apps like Lofi to ship a shared API key: every user
registers their own (free) Spotify application and gives Lofi its Client ID. It takes about
two minutes and requires no coding:

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) (log in
   with your regular Spotify account) and click **Create app**, or go directly to the
   [create form](https://developer.spotify.com/dashboard/create).
2. Fill in the form:
   - **App name / description**: anything you like, e.g. `lofi player`
   - **Website**: leave empty
   - **Redirect URIs**: enter exactly `http://127.0.0.1:41419` and click **Add**
   - **Which API/SDKs are you planning to use?**: check **Web API**
   - accept the Developer Terms and hit **Save**
3. Open your new app's page and copy its **Client ID**.
4. Start Lofi and paste the Client ID into the field on the welcome screen, then log in.

Notes:

- Playback controls (play/pause/skip/volume) require Spotify **Premium**; free accounts can
  still see track info and cover art.
- Your app runs in Spotify's *development mode*, which is limited to your own account plus
  up to 25 users you explicitly add under **User Management** in the dashboard.

# Building

To build, you'll need `node-gyp`, a compatible Python version (2.x), and your operating system's SDK (Microsoft Build Tools or Xcode).

First, you'll need to run:

```
$ yarn install
```

If you have more than one Python installation on your system, you can prevent the build from failing by editing the `package.json` file in the root directory.

Append the following on the `"build": ...` line:

```
--python path/to/python27
```

Now you can run `yarn install` again.

# Distribution

To **create a setup file**, run `yarn run dist`. The output will be located in `./dist`.

```
$ yarn run dist
```

# Development

To **develop**, open up a Terminal and type:

```
$ yarn run development
$ yarn run start
```

# Bugs, issues, and contributing

Found a 🐛? Have a feature request? Feel free to open an [issue](https://github.com/dvx/lofi/issues) or [contribute](https://github.com/dvx/lofi).

As always, you are more than welcome join our [Discord](https://discord.gg/YuH9UJk) 🎤 server. The more the merrier! 🎉

Don't forget to ⭐ and/or fork this repo.

# License

MIT
