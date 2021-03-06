// deno-lint-ignore-file camelcase no-explicit-any
import { WebAPICallError } from "../deps.ts"

export type APIEvent = {
    ack: (response?: Record<string, unknown>) => Promise<void>
    body: {
        [key: string]: any
    }
}

export type TypedAPIEvent = { type: string } & APIEvent
export type EventsAPIEvent = { event: any } & APIEvent
export type UnknownEventsAPIEvent = APIEvent | EventsAPIEvent | TypedAPIEvent

export type Events = {
    // Socket Mode Package Events
    ready: null
    connecting: null
    connected: null
    disconnecting: null
    reconnecting: null
    authenticated: any
    outgoing_message: {
        envelope_id: string
        payload: Record<string, any>
    }
    disconnected: Error | undefined
    unable_to_socket_mode_start: WebAPICallError
    slack_event: TypedAPIEvent

    // Slack API Events
    // TODO Add types, one file for each
    app_home_opened: UnknownEventsAPIEvent
    app_mention: UnknownEventsAPIEvent
    app_rate_limited: UnknownEventsAPIEvent
    app_requested: UnknownEventsAPIEvent
    app_uninstalled: UnknownEventsAPIEvent
    call_rejected: UnknownEventsAPIEvent
    channel_archive: UnknownEventsAPIEvent
    channel_created: UnknownEventsAPIEvent
    channel_deleted: UnknownEventsAPIEvent
    channel_history_changed: UnknownEventsAPIEvent
    channel_id_changed: UnknownEventsAPIEvent
    channel_left: UnknownEventsAPIEvent
    channel_rename: UnknownEventsAPIEvent
    channel_shared: UnknownEventsAPIEvent
    channel_unarchive: UnknownEventsAPIEvent
    channe_unshared: UnknownEventsAPIEvent
    dnd_updated: UnknownEventsAPIEvent
    dnd_updated_user: UnknownEventsAPIEvent
    email_domain_changed: UnknownEventsAPIEvent
    emoji_changed: UnknownEventsAPIEvent
    file_change: UnknownEventsAPIEvent
    file_comment_added: UnknownEventsAPIEvent
    file_commend_deleted: UnknownEventsAPIEvent
    file_comment_edited: UnknownEventsAPIEvent
    file_created: UnknownEventsAPIEvent
    file_deleted: UnknownEventsAPIEvent
    file_public: UnknownEventsAPIEvent
    file_shared: UnknownEventsAPIEvent
    file_unshared: UnknownEventsAPIEvent
    grid_migration_finished: UnknownEventsAPIEvent
    grid_migration_started: UnknownEventsAPIEvent
    group_archive: UnknownEventsAPIEvent
    group_close: UnknownEventsAPIEvent
    group_deleted: UnknownEventsAPIEvent
    group_history_changed: UnknownEventsAPIEvent
    group_left: UnknownEventsAPIEvent
    group_open: UnknownEventsAPIEvent
    group_rename: UnknownEventsAPIEvent
    group_unarchive: UnknownEventsAPIEvent
    im_close: UnknownEventsAPIEvent
    im_created: UnknownEventsAPIEvent
    im_history_changed: UnknownEventsAPIEvent
    im_open: UnknownEventsAPIEvent
    invite_requested: UnknownEventsAPIEvent
    link_shared: UnknownEventsAPIEvent
    member_joined_channel: UnknownEventsAPIEvent
    member_left_channel: UnknownEventsAPIEvent
    message: UnknownEventsAPIEvent
    "message.app_home": UnknownEventsAPIEvent
    "message.channels": UnknownEventsAPIEvent
    "message.groups": UnknownEventsAPIEvent
    "message.im": UnknownEventsAPIEvent
    "message.mpim": UnknownEventsAPIEvent
    pin_added: UnknownEventsAPIEvent
    pin_removed: UnknownEventsAPIEvent
    reaction_added: UnknownEventsAPIEvent
    reaction_removed: UnknownEventsAPIEvent
    resources_added: UnknownEventsAPIEvent
    resources_removed: UnknownEventsAPIEvent
    scope_denied: UnknownEventsAPIEvent
    scope_granted: UnknownEventsAPIEvent
    star_added: UnknownEventsAPIEvent
    star_removed: UnknownEventsAPIEvent
    subteam_created: UnknownEventsAPIEvent
    subteam_members_changed: UnknownEventsAPIEvent
    subteam_self_added: UnknownEventsAPIEvent
    subteam_self_removed: UnknownEventsAPIEvent
    subteam_updated: UnknownEventsAPIEvent
    team_access_granted: UnknownEventsAPIEvent
    team_access_revoked: UnknownEventsAPIEvent
    team_domain_change: UnknownEventsAPIEvent
    team_join: UnknownEventsAPIEvent
    team_rename: UnknownEventsAPIEvent
    tokens_revoked: UnknownEventsAPIEvent
    user_verification: UnknownEventsAPIEvent
    user_change: UnknownEventsAPIEvent
    user_resource_denied: UnknownEventsAPIEvent
    user_resource_granted: UnknownEventsAPIEvent
    user_resource_removed: UnknownEventsAPIEvent
    workflow_deleted: UnknownEventsAPIEvent
    workflow_published: UnknownEventsAPIEvent
    workflow_step_deleted: UnknownEventsAPIEvent
    workflow_step_execute: UnknownEventsAPIEvent
    workflow_unpublished: UnknownEventsAPIEvent
    slash_command: {
        ack: (response?: Record<string, unknown>) => Promise<void>
        body: {
            token: string
            team_id: string
            team_domain: string
            channel_id: string
            channel_name: string
            user_id: string
            user_name: string
            command: string
            text: string
            api_app_id: string
            is_enterprise_install: string
            response_url: string
            trigger_id: string
        }
    }
}
