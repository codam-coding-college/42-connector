import fetch from 'node-fetch'
import urlParameterAppend from 'url-parameter-append'

interface AccessToken {
	access_token: string
	token_type: string
	expires_in: number
	scope: string
	created_at: number
}

class RequestLimiter {
	private _maxRequestPerSecond: number
	private _thisSecond: number
	private _requestsThisSecond: number

	constructor(maxRequestPerSecond: number) {
		this._maxRequestPerSecond = maxRequestPerSecond
		this._thisSecond = 0
		this._requestsThisSecond = 0
	}

	async limit(): Promise<void> {
		const now = Date.now()
		if (Math.floor(now / 1000) != this._thisSecond) {
			this._requestsThisSecond = 0
			this._thisSecond = Math.floor(now / 1000)
			return
		}
		this._requestsThisSecond++
		if (this._requestsThisSecond >= this._maxRequestPerSecond) {
			await new Promise(resolve => setTimeout(resolve, ((this._thisSecond + 1) * 1000) - now))
		}
	}
}

interface Response {
	ok: boolean
	status?: number
	json?: any | any[]
}

export class API {
	private _root: string
	private _UID: string
	private _secret: string
	private _accessToken: AccessToken | null
	private _logging: boolean
	private _accessTokenExpiry: number
	private _startCooldown: number
	private _cooldown: number
	private _cooldownGrowthFactor: number
	private _limiter: RequestLimiter

	constructor(clientUID: string, clientSecret: string, maxRequestPerSecond: number = 1 / 3, logging: boolean = false, root = 'https://api.intra.42.fr') {
		this._logging = logging
		this._root = root
		this._UID = clientUID
		this._secret = clientSecret
		this._accessToken = null
		this._accessTokenExpiry = -1
		this._startCooldown = 1500
		this._cooldown = this._startCooldown
		this._cooldownGrowthFactor = 2
		this._limiter = new RequestLimiter(maxRequestPerSecond)
	}

	private async _fetch(address: string, opt: any, isTokenUpdateRequest: boolean): Promise<Response> {
		if (!isTokenUpdateRequest) {
			await this._updateToken()
			if (!opt.headers)
				opt.headers = {}
			opt.headers['Authorization'] = `Bearer ${this._accessToken!.access_token}`
		}

		if (this._logging)
			console.log(`${new Date().toISOString()} REQUEST ${address}, ${JSON.stringify(opt)}`)

		await this._limiter.limit()
		const response = await fetch(address, opt)
		if (response.status === 429) {
			if (this._logging)
				console.log(`${new Date().toISOString()} [fetch error]: status: ${response?.status} body: ${JSON.stringify(response)} retrying in ${this._cooldown / 1000} seconds`)
			await new Promise(resolve => setTimeout(resolve, this._cooldown))
			this._cooldown *= this._cooldownGrowthFactor
			return await this._fetch(address, opt, isTokenUpdateRequest)
		}
		this._cooldown = this._startCooldown
		try {
			const json = await response.json()
			return { ok: true, status: response.status, json }
		} catch (err) {
			return { ok: false, status: response.status }
		}
	}

	private async _updateToken() {
		if (this._accessTokenExpiry > Date.now() + 60 * 1000)
			return
		const opt = {
			method: 'POST',
			body: `grant_type=client_credentials&client_id=${this._UID}&client_secret=${this._secret}&scopes=public,projects`,
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
		}
		this._accessToken = (await this._fetch(`${this._root}/oauth/token`, opt, true)).json as AccessToken
		this._accessTokenExpiry = + Date.now() + this._accessToken!.expires_in * 1000
		if (this._logging)
			console.log(`[new token]: expires in ${this._accessToken!.expires_in} seconds, on ${new Date(this._accessTokenExpiry).toISOString()}`)
	}

	async get(path: string): Promise<Response> {
		return await this._fetch(`${this._root}${path}`, {}, false)
	}

	async post(path: string, body: Object): Promise<Response> {
		const opt = {
			headers: {
				'Content-Type': 'application/json',
			},
			method: 'POST',
			body: JSON.stringify(body)
		}
		return await this._fetch(`${this._root}${path}`, opt, false)
	}

	async delete(path: string): Promise<Response> {
		const opt = {
			method: 'DELETE',
		}
		return await this._fetch(`${this._root}${path}`, opt, false)
	}


	async getPaged(path: string, onPage?: (response: any) => void): Promise<Response> {
		let items: any[] = []

		const address = `${this._root}${path}`
		for (let i = 1; ; i++) {
			const addressI = urlParameterAppend(address, { 'page[number]': i })
			const response: Response = await this._fetch(addressI, {}, false)
			if (!response.ok)
				return { ok: false, status: response.status, json: items }
			if (response.json.length === 0)
				break
			if (onPage)
				onPage(response)
			items = items.concat(response.json)
		}
		return { ok: false, json: items }
	}
}
