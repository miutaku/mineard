/**
 * mineo API client.
 * All endpoints use POST with form-urlencoded body.
 * Base URL: https://api.eonet.jp/mineo/v1/
 */

import type {
    TelnumListResponse,
    CapacityResponse,
    CapacityForGiftResponse,
    IssueGiftResponse,
    ChangeGiftResponse,
    DeclareResponse,
    DevolveDeclareStatResponse,
    Env,
} from '../types';

interface MineoRequestOptions {
    idToken: string;
    aid?: string;
    env: Env;
}

async function mineoPost<T>(
    endpoint: string,
    options: MineoRequestOptions,
    body?: Record<string, string>
): Promise<T> {
    const params = new URLSearchParams();
    if (body) {
        for (const [key, value] of Object.entries(body)) {
            params.append(key, value);
        }
    }

    const response = await fetch(`${options.env.MINEO_BASE_URL}/${endpoint}`, {
        method: 'POST',
        headers: {
            'appId': options.env.MINEO_APP_ID,
            'appVersion': options.env.MINEO_APP_VERSION,
            'Authorization': `Bearer ${options.idToken}`,
            'aid': options.aid ?? 'mineard',
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
    });

    if (!response.ok) {
        throw new Error(`mineo API error: ${response.status} ${response.statusText}`);
    }

    return response.json() as Promise<T>;
}

// ---------- 回線関係 ----------

export async function getTelnumList(options: MineoRequestOptions): Promise<TelnumListResponse> {
    return mineoPost<TelnumListResponse>('get_telnum_list', options);
}

export async function getLineName(options: MineoRequestOptions, custId: string): Promise<{ lineName: string; resultCode: string }> {
    return mineoPost('get_line_name', options, { custId });
}

// ---------- パケット関係 ----------

export async function getCapacity(options: MineoRequestOptions, custId: string): Promise<CapacityResponse> {
    return mineoPost<CapacityResponse>('get_capacity', options, { custId });
}

export async function getCapacityForGift(options: MineoRequestOptions, custId: string): Promise<CapacityForGiftResponse> {
    return mineoPost<CapacityForGiftResponse>('get_capacity_for_gift', options, { custId });
}

export async function changeGift(
    options: MineoRequestOptions,
    custId: string,
    giftCode: string
): Promise<ChangeGiftResponse> {
    return mineoPost<ChangeGiftResponse>('change_gift', options, { custId, giftCode });
}

export async function issueGift(
    options: MineoRequestOptions,
    custId: string,
    giftCapacity: number
): Promise<IssueGiftResponse> {
    return mineoPost<IssueGiftResponse>('issue_gift', options, {
        custId,
        giftCapacity: giftCapacity.toString(),
    });
}

// ---------- ゆずるね。関係 ----------

export async function declareDevolve(options: MineoRequestOptions, custId: string): Promise<DeclareResponse> {
    return mineoPost<DeclareResponse>('declare_devolve', options, { custId });
}

export async function getDevolveDeclareState(
    options: MineoRequestOptions,
    custId: string
): Promise<DevolveDeclareStatResponse> {
    return mineoPost<DevolveDeclareStatResponse>('get_devolve_declare_stat', options, { custId });
}
