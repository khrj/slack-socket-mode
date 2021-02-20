<div align="center">
    <img src="assets/logo.svg" width="400" height="400" alt="Socket icon">
    <h1>Slack Socket Mode</h1>
    <p>
        <b>Recieve events from Slack's <a href="https://api.slack.com/apis/connections/events-api">Events API</a> over a WebSocket connection. Deno port of <a href="https://www.npmjs.com/package/@slack/socket-mode">@slack/socket-mode</a></b>
    </p>
    <p>
        <img alt="build status" src="https://img.shields.io/github/workflow/status/KhushrajRathod/slack-socket-mode/Deno?label=checks" >
        <img alt="language" src="https://img.shields.io/github/languages/top/KhushrajRathod/slack-socket-mode" >
        <img alt="code size" src="https://img.shields.io/github/languages/code-size/KhushrajRathod/slack-socket-mode">
        <img alt="issues" src="https://img.shields.io/github/issues/KhushrajRathod/slack-socket-mode" >
        <img alt="license" src="https://img.shields.io/github/license/KhushrajRathod/slack-socket-mode">
        <img alt="version" src="https://img.shields.io/github/v/release/KhushrajRathod/slack-socket-mode">
    </p>
    <p>
        <b><a href="https://deno.land/x/slack_socket_mode">View on deno.land</a></b>
    </p>
    <br>
    <br>
    <br>
</div>

## Usage

```ts
import "https://deno.land/x/dotenv@v2.0.0/load.ts"
import { SocketModeClient } from "https://deno.land/x/slack_socket_mode@1.0.1/mod.ts"

const appToken = Deno.env.get("SLACK_APP_TOKEN")
const socketModeClient = new SocketModeClient({ appToken })

// Attach listeners to events by type. See: https://api.slack.com/events/message
socketModeClient.addEventListener("message", ({ detail: { body, ack } }) => {
    ack()
    console.log(body)
})

await socketModeClient.start()
```

## API

- API is similar to the [node @slack/socket-mode](https://www.npmjs.com/package/@slack/socket-mode), where `.addEventListener` is used instead of `.on` ([EventTarget docs](https://developer.mozilla.org/en-US/docs/Web/API/EventTarget))
- Complete [generated docs](https://doc.deno.land/https/deno.land/x/slack_socket_mode@1.0.1/mod.ts) are also available

## Supporters

[![Stargazers repo roster for @KhushrajRathod/slack-socket-mode](https://reporoster.com/stars/KhushrajRathod/slack-socket-mode)](https://github.com/KhushrajRathod/slack-socket-mode/stargazers)

[![Forkers repo roster for @KhushrajRathod/slack-socket-mode](https://reporoster.com/forks/KhushrajRathod/slack-socket-mode)](https://github.com/KhushrajRathod/slack-socket-mode/network/members)

## Related

- [Deno modules](https://github.com/KhushrajRathod/DenoModules)
