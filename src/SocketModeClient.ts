// deno-lint-ignore-file no-explicit-any
import Finity from 'https://deno.land/x/finity@1.0.2/mod.js'
import { StateMachine } from 'https://deno.land/x/finity@1.0.2/index.d.ts'
import { TypedCustomEvent, TypedEventTarget } from "https://deno.land/x/typed_event_target@1.0.1/mod.ts"
import { Events } from './events.ts'
import {
    WebClient,
    WebAPICallResult,
    WebAPICallError,
    ErrorCode as APICallErrorCode,
    addAppMetadata,
    WebClientOptions,
} from 'https://deno.land/x/slack_web_api@1.0.1/mod.ts'
import { LogLevel, Logger, getLogger } from './logger.ts'
import {
    websocketErrorWithOriginal,
    sendWhileDisconnectedError,
    sendWhileNotReadyError,
} from './errors.ts'

import { name, version } from '../config.ts'

/**
 * An Socket Mode Client allows programs to communicate with the
 * [Slack Platform's Events API](https://api.slack.com/events-api) over a websocket.
 * This object uses the EventEmitter pattern to dispatch incoming events and has a built in send method to
 * acknowledge incoming events over the websocket.
 */
export class SocketModeClient extends TypedEventTarget<Events> {
    /**
     * Whether or not the client is currently connected to the web socket
     */
    public connected = false

    /**
     * Whether or not the client has authenticated to the Socket Mode API. This occurs when the connect method
     * completes, and a WebSocket URL is available for the client's connection.
     */
    public authenticated = false

    // public listenerIterator: AsyncGenerator | undefined

    /**
     * Whether this client will automatically reconnect when (not manually) disconnected
     */
    private autoReconnectEnabled

    /**
     * The number of milliseconds to wait upon connection for reply messages from the previous connection. The default
     * value is 2 seconds.
     */
    // private replyAckOnReconnectTimeout: number

    /**
     * State machine that backs the transition and action behavior
     */
    private stateMachine: StateMachine<string, string>

    /**
     * Configuration for the state machine
     */
    private stateMachineConfig = Finity
        .configure()
        .initialState('disconnected')
        .on('start').transitionTo('connecting')
        // .onEnter(() => {})
        .state('connecting')
        .submachine(Finity.configure()
            .initialState('authenticating')
            .do(async () => {
                try {
                    const result = await this.webClient.apps.connections.open()
                    return result
                } catch (error) {
                    this.logger.error(error)
                    return await Promise.reject(error)
                }
            })
            .onSuccess().transitionTo('authenticated')
            .onFailure()
            .transitionTo('reconnecting').withCondition((context: any) => {
                const error = context.error as WebAPICallError
                this.logger.info(`unable to Socket Mode start: ${error.message}`)

                // Observe this event when the error which causes reconnecting or disconnecting is meaningful
                this.dispatchEvent(new TypedCustomEvent('unable_to_socket_mode_start', { detail: error }))
                let isRecoverable = true
                if (error.code === APICallErrorCode.PlatformError &&
                    (Object.values(UnrecoverableSocketModeStartError) as string[]).includes(error.data.error)) {
                    isRecoverable = false
                } else if (error.code === APICallErrorCode.RequestError) {
                    isRecoverable = false
                } else if (error.code === APICallErrorCode.HTTPError) {
                    isRecoverable = false
                }

                return this.autoReconnectEnabled && isRecoverable
            })
            .transitionTo('failed')
            .state('authenticated')
            .onEnter((_state: any, context: any) => {
                this.authenticated = true
                this.setupWebSocket(context.result.url)
                setTimeout(() => {
                    this.dispatchEvent(new TypedCustomEvent('authenticated', { detail: context.result }))
                }, 0)
            })
            .on('websocket open').transitionTo('handshaking')
            .state('handshaking') // a state in which to wait until the 'server hello' event
            .state('failed')
            .onEnter((_state: any, context: any) => {
                // dispatch 'failure' on parent machine to transition out of this submachine's states
                this.stateMachine.handle('failure', context.error)
            })
            .global()
            .onStateEnter((state: any) => {
                this.logger.debug(`transitioning to state: connecting:${state}`)
            })
            .getConfig())
        .on('server hello').transitionTo('connected')
        .on('websocket close')
        .transitionTo('reconnecting').withCondition(() => this.autoReconnectEnabled)
        .transitionTo('disconnected').withAction(() => {
            // this transition circumvents the 'disconnecting' state (since the websocket is already closed), so we need
            // to execute its onExit behavior here.
            this.teardownWebsocket()
        })
        .on('failure').transitionTo('disconnected')
        .on('explicit disconnect').transitionTo('disconnecting')
        .state('connected')
        .onEnter(() => {
            this.connected = true
        })
        .submachine(Finity.configure()
            .initialState('ready')
            .onEnter(() => {
                if (this.badConnection) {
                    // arrived here because `server ping timeout` ocurred and a new connection was created
                    // tear down old connection
                    this.teardownWebsocket()
                    this.badConnection = false
                }
                // start heartbeat to keep track of the websocket connection continuing to be alive
                this.heartbeat()
                // the transition isn't done yet, so we delay the following statement until after the event loop returns
                setTimeout(() => {
                    this.dispatchEvent(new TypedCustomEvent('ready', { detail: null }))
                }, 0)
            })
            .on('server disconnect warning').transitionTo('refreshing-connection').withCondition(() => this.autoReconnectEnabled)
            .on('server pings not received').transitionTo('refreshing-connection').withCondition(() => this.autoReconnectEnabled)
            .on('server disconnect old socket').transitionTo('closing-socket')
            .state('refreshing-connection')
            .submachine(Finity.configure()
                .initialState('authenticating')
                .do(async () => {
                    try {
                        const result = await this.webClient.apps.connections.open()
                        return result
                    } catch (error) {
                        this.logger.error(error)
                        return await Promise.reject(error)
                    }
                })
                .onSuccess().transitionTo('authenticated')
                .onFailure()
                .transitionTo('authenticating').withCondition((context: any) => {
                    const error = context.error as WebAPICallError
                    this.logger.info(`unable to Socket Mode start: ${error.message}`)

                    // Observe this event when the error which causes reconnecting or disconnecting is meaningful
                    this.dispatchEvent(new TypedCustomEvent('unable_to_socket_mode_start', { detail: error }))

                    let isRecoverable = true
                    if (error.code === APICallErrorCode.PlatformError &&
                        (Object.values(UnrecoverableSocketModeStartError) as string[]).includes(error.data.error)) {
                        isRecoverable = false
                    } else if (error.code === APICallErrorCode.RequestError) {
                        isRecoverable = false
                    } else if (error.code === APICallErrorCode.HTTPError) {
                        isRecoverable = false
                    }

                    return this.autoReconnectEnabled && isRecoverable
                })
                .transitionTo('failed')
                .state('authenticated')
                .onEnter((_state: any, context: any) => {
                    this.authenticated = true
                    this.setupWebSocket(context.result.url)
                    setTimeout(() => {
                        this.dispatchEvent(new TypedCustomEvent('authenticated', { detail: context.result }))
                    }, 0)
                })
                .on('websocket open').transitionTo('handshaking')
                .state('handshaking') // a state in which to wait until the 'server hello' event
                .state('failed')
                .onEnter((_state: any, context: any) => {
                    // dispatch 'failure' on parent machine to transition out of this submachine's states
                    this.stateMachine.handle('failure', context.error)
                })
                .global()
                .onStateEnter((state: any) => {
                    this.logger.debug(`transitioning to state: refreshing-connection:${state}`)
                })
                .getConfig())
            .on('server hello').transitionTo('ready')
            .on('websocket close')
            .transitionTo('authenticating').withCondition(() => this.autoReconnectEnabled)
            .transitionTo('disconnected').withAction(() => {
                // this transition circumvents the 'disconnecting' state (since the websocket is already closed),
                // so we need to execute its onExit behavior here.
                this.teardownWebsocket()
            })
            .on('failure').transitionTo('disconnected')
            .on('explicit disconnect').transitionTo('disconnecting')
            .state('closing-socket')
            .do(() => {
                // stop heartbeat
                if (this.pingTimeout !== undefined) {
                    clearTimeout(this.pingTimeout)
                }

                return Promise.resolve(true)
            })
            .onSuccess().transitionTo('ready')
            .onExit(() => this.teardownWebsocket())
            .global()
            .onStateEnter((state: any) => {
                this.logger.debug(`transitioning to state: connected:${state}`)
            })
            .getConfig())
        .on('server disconnect warning')
        .transitionTo('refreshing-connection').withCondition(() => this.autoReconnectEnabled)
        .on('websocket close')
        .transitionTo('reconnecting').withCondition(() => this.autoReconnectEnabled)
        .transitionTo('disconnected').withAction(() => {
            // this transition circumvents the 'disconnecting' state (since the websocket is already closed), so we need
            // to execute its onExit behavior here.
            this.teardownWebsocket()
        })
        .on('explicit disconnect').transitionTo('disconnecting')
        .onExit(() => {
            this.connected = false
            this.authenticated = false

            if (this.pingTimeout !== undefined) {
                clearTimeout(this.pingTimeout)
            }
        })
        .state('disconnecting')
        .onEnter(() => {
            // Most of the time, a websocket will exist. The only time it does not is when transitioning from connecting,
            // before the client.start() has finished and the websocket hasn't been set up.
            if (this.websocket !== undefined) {
                this.websocket.close()
            }
        })
        .on('websocket close').transitionTo('disconnected')
        .onExit(() => this.teardownWebsocket())
        // reconnecting is just like disconnecting, except that the websocket should already be closed before we enter
        // this state, and that the next state should be connecting.
        .state('reconnecting')
        .do(() => {
            if (this.pingTimeout !== undefined) {
                clearTimeout(this.pingTimeout)
            }
            return Promise.resolve(true)
        })
        .onSuccess().transitionTo('connecting')
        .onExit(() => this.teardownWebsocket())
        .global()
        .onStateEnter((state: 'disconnected' | 'connecting' | 'connected' | 'disconnecting' | 'reconnecting', context: any) => {
            this.logger.debug(`transitioning to state: ${state}`)
            if (state === 'disconnected') {
                // Emits a `disconnected` event with a possible error object (might be undefined)
                this.dispatchEvent(new TypedCustomEvent(state, { detail: context.eventPayload }))
            } else {
                // Emits events: `connecting`, `connected`, `disconnecting`, `reconnecting`
                this.dispatchEvent(new TypedCustomEvent(state, { detail: null }))
            }
        })
        .getConfig()

    /**
     * The client's websockets
     */
    public websocket?: WebSocket
    private secondaryWebsocket?: WebSocket

    private webClient: WebClient

    /**
     * The name used to prefix all logging generated from this object
     */
    private static loggerName = 'SocketModeClient'

    /**
     * This object's logger instance
     */
    private logger: Logger

    /**
     * How long to wait for pings from server before timing out
     */
    private clientPingTimeout: number

    /**
     * reference to the timeout timer we use to listen to pings from the server
     */
    private pingTimeout: number | undefined

    /**
     * Used to see if a websocket stops sending heartbeats and is deemed bad
     */
    private badConnection = false

    constructor({
        logger = undefined,
        logLevel = LogLevel.INFO,
        autoReconnectEnabled = true,
        clientPingTimeout = 30000,
        appToken = undefined,
        clientOptions = {},
    }: SocketModeOptions = {}) {
        super()

        if (appToken === undefined) {
            throw new Error('Must provide an App Level Token when initalizing a Socket Mode Client')
        }

        this.clientPingTimeout = clientPingTimeout

        // Setup the logger
        if (typeof logger !== 'undefined') {
            this.logger = logger
            if (typeof logLevel !== 'undefined') {
                this.logger.debug('The logLevel given to Socket Mode was ignored as you also gave logger')
            }
        } else {
            this.logger = getLogger(SocketModeClient.loggerName, logLevel, logger)
        }

        this.webClient = new WebClient('', {
            logLevel: this.logger.getLevel(),
            headers: { Authorization: `Bearer ${appToken}` },
            ...clientOptions,
        })

        this.autoReconnectEnabled = autoReconnectEnabled

        this.stateMachine = Finity.start(this.stateMachineConfig)

        this.logger.debug('initialized')
    }

    /**
     * Begin an Socket Mode session. This method must be called before any messages can
     * be sent or received.
     */
    public start(): Promise<WebAPICallResult> {
        this.logger.debug('start()')

        // delegate behavior to state machine
        this.stateMachine.handle('start')

        // return a promise that resolves with the connection information
        return new Promise((resolve: (value: Event) => void, reject) => {
            this.addEventListener('authenticated', (result) => {
                this.removeEventListener('disconnected', reject)
                resolve(result)
            }, { once: true })

            this.addEventListener('disconnected', (err) => {
                this.removeEventListener('authenticated', resolve)
                reject(err)
            }, { once: true })
        }) as unknown as Promise<WebAPICallResult>
    }

    /**
     * End a Socket Mode session. After this method is called no messages will be sent or received unless you call
     * start() again later.
     */
    public disconnect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.logger.debug('manual disconnect')

            // resolve (or reject) on disconnect
            this.addEventListener('disconnected', (err) => {
                if (err instanceof Error) {
                    reject(err)
                } else {
                    resolve()
                }
            }, { once: true })

            // delegate behavior to state machine
            this.stateMachine.handle('explicit disconnect')
        })
    }

    /**
     * Method for sending an outgoing message of an arbitrary type over the websocket connection.
     * Primarily used to send acknowledgements back to slack for incoming events
     * @param id the envelope id
     * @param body the message body
     */
    private send(id: string, body = {}): Promise<void> {
        // deno-lint-ignore camelcase
        const message = { envelope_id: id, payload: { ...body } }

        return new Promise((resolve, reject) => {
            this.logger.debug(`send() in state: ${this.stateMachine.getStateHierarchy()}`)
            if (this.websocket === undefined) {
                this.logger.error('cannot send message when client is not connected')
                reject(sendWhileDisconnectedError())
            } else if (!(this.stateMachine.getCurrentState() === 'connected' &&
                this.stateMachine.getStateHierarchy()[1] === 'ready')) {
                this.logger.error('cannot send message when client is not ready')
                reject(sendWhileNotReadyError())
            } else {
                this.dispatchEvent(new TypedCustomEvent('outgoing_message', { detail: message }))

                const flatMessage = JSON.stringify(message)
                this.logger.debug(`sending message on websocket: ${flatMessage}`)

                try {
                    this.websocket.send(flatMessage)
                    resolve()
                } catch (e) {
                    this.logger.error(`failed to send message on websocket: ${e.message}`)
                    return reject(websocketErrorWithOriginal(e))
                }
            }
        })
    }

    /**
     * Set up method for the client's websocket instance. This method will attach event listeners.
     */
    private setupWebSocket(url: string): void {
        let websocket: WebSocket
        if (this.websocket === undefined) {
            this.websocket = new WebSocket(url)
            websocket = this.websocket
        } else {
            // setup secondary websocket
            // this is used when creating a new connection because the first is about to disconnect
            this.secondaryWebsocket = new WebSocket(url)
            websocket = this.secondaryWebsocket
        }

        // attach event listeners
        websocket.onopen = event => this.stateMachine.handle('websocket open', event)
        websocket.onclose = event => this.stateMachine.handle('websocket close', event)
        websocket.onerror = (event) => {
            this.logger.error(`A websocket error occurred: ${(event as ErrorEvent).message}`)
            this.dispatchEvent(new TypedCustomEvent('error', { detail: websocketErrorWithOriginal((event as ErrorEvent).error) }))
        }

        websocket.onmessage = this.onWebsocketMessage.bind(this)

        // Confirm websocket connection is still active
        websocket.addEventListener('ping', this.heartbeat.bind(this))
    }

    /**
     * Tear down method for the client's websocket instance. This method undoes the work in setupWebSocket(url).
     */
    private teardownWebsocket(): void {
        if (this.secondaryWebsocket !== undefined && this.websocket !== undefined) {
            this.logger.debug('secondary websocket exists, tear down first and assign second')
            // currently have two websockets, so tear down the older one
            this.websocket.onopen = null
            this.websocket.onclose = null
            this.websocket.onerror = null
            this.websocket.onmessage = null
            this.websocket = this.secondaryWebsocket
            this.secondaryWebsocket = undefined
        } else if (this.secondaryWebsocket === undefined && this.websocket !== undefined) {
            this.logger.debug('only primary websocket exists, tear it down')
            // only one websocket to tear down
            this.websocket.onopen = null
            this.websocket.onclose = null
            this.websocket.onerror = null
            this.websocket.onmessage = null
            this.websocket = undefined
        }
    }

    /**
     * confirms websocket connection is still active
     * fires whenever a ping event is received
     */
    private heartbeat(): void {
        if (this.pingTimeout !== undefined) {
            clearTimeout(this.pingTimeout)
        }

        // Don't start heartbeat if connection is already deemed bad
        if (!this.badConnection) {
            this.pingTimeout = setTimeout(() => {
                this.logger.info(`A ping wasn't received from the server before the timeout of ${this.clientPingTimeout}ms!`)
                if (this.stateMachine.getCurrentState() === 'connected'
                    && this.stateMachine.getStateHierarchy()[1] === 'ready') {
                    this.badConnection = true
                    // opens secondary websocket and teardown original once that is ready
                    this.stateMachine.handle('server pings not received')
                }
            }, this.clientPingTimeout)
        }
    }

    /**
     * `onmessage` handler for the client's websocket. This will parse the
     * payload and dispatch the relevant events for each incoming message.
     */
    private onWebsocketMessage({ data }: { data: string }): void {
        this.logger.debug('received a message on the WebSocket')

        // parse message into slack event
        let event: {
            type: string
            reason: string
            payload: { [key: string]: any }
            envelope_id: string
        }

        try {
            event = JSON.parse(data)
        } catch (parseError) {
            // prevent application from crashing on a bad message, but log an error to bring attention
            this.logger.error(
                `unable to parse incoming websocket message: ${parseError.message}`,
            )
            return
        }

        // internal event handlers
        if (event.type === 'hello') {
            this.stateMachine.handle('server hello')
            return
        }

        // open second websocket connection in preparation for the existing websocket disconnecting
        if (event.type === 'disconnect' && event.reason === 'warning') {
            this.logger.debug('disconnect warning, creating second connection')
            this.stateMachine.handle('server disconnect warning')
            return
        }

        // close primary websocket in favor of secondary websocket, assign secondary to primary
        if (event.type === 'disconnect' && event.reason === 'refresh_requested') {
            this.logger.debug('disconnect refresh requested, closing old websocket')
            this.stateMachine.handle('server disconnect old socket')
            // TODO: instead of using this event to reassign secondaryWebsocket to this.websocket,
            // use the websocket close event
            return
        }

        // Define Ack
        const ack = async (response: Record<string, unknown>): Promise<void> => {
            this.logger.debug('calling ack', event.type)
            await this.send(event.envelope_id, response)
        }

        // for events_api messages, expose the type of the event
        if (event.type === 'events_api') {
            this.dispatchEvent(new TypedCustomEvent(event.payload.event.type, { detail: { ack, body: event.payload, event: event.payload.event } }))
        } else {
            // emit just ack and body for all other types of messages
            this.dispatchEvent(new TypedCustomEvent(event.type, { detail: { ack, body: event.payload } }))
        }

        // emitter for all slack events
        // used in tools like bolt-js
        this.dispatchEvent(new TypedCustomEvent('slack_event', { detail: { ack, type: event.type, body: event.payload } }))
    }
}

/* Instrumentation */
addAppMetadata({ name: name, version: version })

export default SocketModeClient

/*
 * Exported types
 */

export interface SocketModeOptions {
    appToken?: string // app level token
    logger?: Logger
    logLevel?: LogLevel
    autoReconnectEnabled?: boolean
    clientPingTimeout?: number
    clientOptions?: Omit<WebClientOptions, 'logLevel' | 'logger'>
}

// NOTE: there may be a better way to add metadata to an error about being "unrecoverable" than to keep an
// independent enum, probably a Set (this isn't used as a type).
enum UnrecoverableSocketModeStartError {
    NotAuthed = 'not_authed',
    InvalidAuth = 'invalid_auth',
    AccountInactive = 'account_inactive',
    UserRemovedFromTeam = 'user_removed_from_team',
    TeamDisabled = 'team_disabled',
}

export { TypedCustomEvent, TypedEventTarget } from "https://deno.land/x/typed_event_target@1.0.1/mod.ts"
export type { Events } from './events.ts'