// ---------- Environment Bindings ----------

export interface Env {
    DB: D1Database;
    ENCRYPTION_KEY: string;
    APP_ENV: string;
    FRONTEND_URL: string;
    AUTH_SECRET: string; // JWT signing secret
    MINEO_APP_ID: string;
    MINEO_APP_VERSION: string;
    MINEO_BASE_URL: string;
    MINEO_OIDC_TOKEN_URL: string;
    MINEO_OIDC_CLIENT_ID: string;
    DISCORD_WEBHOOK_URL?: string;
}

/** Hono app-level type including per-request variables */
export type HonoEnv = {
    Bindings: Env;
    Variables: {
        userId: number;
    };
};

// ---------- Database Models ----------

export interface User {
    id: number;
    email: string;
    totp_secret: string | null;
    totp_setup_complete: number;
    is_admin: number;
    discord_mention_id: string | null;
    created_at: string;
}

export interface Account {
    id: number;
    user_id: number;
    display_name: string;
    cust_id: string;
    refresh_token: string; // encrypted
    id_token: string | null; // encrypted
    token_expires_at: string | null;
    yuzurune_enabled: number;
    packet_threshold: number | null;
    packet_alert_enabled: number;
    created_at: string;
}

export interface GiftPair {
    id: number;
    source_account_id: number;
    target_account_id: number;
    enabled: number;
    created_at: string;
}

export interface JobLog {
    id: number;
    job_type: 'yuzurune' | 'packet_exchange';
    account_id: number | null;
    status: 'success' | 'failed' | 'skipped';
    message: string | null;
    gift_code: string | null;
    packet_amount: number | null;
    executed_at: string;
}

export interface AppConfig {
    key: string;
    value: string;
}

// ---------- mineo API Response Types ----------

export interface MineoBaseResponse {
    resultCode: string;
    messages: (string | null)[];
}

export interface TelnumListResponse extends MineoBaseResponse {
    telNumList: {
        custId: string;
        lineName: string;
        telNum: string;
    }[] | null;
}

export interface CapacityResponse extends MineoBaseResponse {
    packetInfo: {
        baseCapacity: number;
        baseRemainingCapacity: number;
        chargeCapacity: number;
        chargeRemainingCapacity: number;
        forwardCapacity: number;
        forwardRemainingCapacity: number;
        giftCapacity: number;
        giftRemainingCapacity: number;
    } | null;
    speedFlg: string | null;
    tushinSettingStatusCode: string | null;
    mySokuFlg: string | null;
    serviceName: string | null;
    lowSpeedDisp: string | null;
}

export interface CapacityForGiftResponse extends MineoBaseResponse {
    capacityForGift: number | null;
}

export interface IssueGiftResponse extends MineoBaseResponse {
    giftCode: string | null;
    giftCapacity: number | null;
    expireDate: string | null;
}

export interface ChangeGiftResponse extends MineoBaseResponse {
    giftCapacity: number | null;
}

export interface DeclareResponse extends MineoBaseResponse { }

export interface DevolveDeclareStatResponse extends MineoBaseResponse {
    devolveDeclareStat: string | null;
    devolveDeclareAcceptability: string | null;
}

// ---------- Token Refresh ----------

export interface TokenRefreshResponse {
    access_token: string;
    expires_in: string;
    id_token: string;
    refresh_token: string;
    token_type: string;
}

export interface TokenRefreshError {
    error: string;
    error_description: string;
}

// ---------- API Request/Response DTOs ----------

export interface CreateAccountRequest {
    display_name: string;
    cust_id: string;
    refresh_token: string;
    yuzurune_enabled?: boolean;
}

export interface UpdateAccountRequest {
    display_name?: string;
    refresh_token?: string;
    yuzurune_enabled?: boolean;
    packet_threshold?: number | null;
    packet_alert_enabled?: boolean;
}

export interface CreateGiftPairRequest {
    source_account_id: number;
    target_account_id: number;
}

export interface DashboardData {
    accounts: (Account & {
        capacity?: CapacityResponse['packetInfo'];
        yuzurune_status?: string;
        token_valid: boolean;
    })[];
    recent_logs: JobLog[];
    next_yuzurune_run: string;
    next_exchange_run: string;
}
