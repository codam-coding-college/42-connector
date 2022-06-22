import fetch, { RequestInit } from 'node-fetch'
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

interface Response<T = any | any[]> {
	ok: boolean
	status?: number
	json?: T
}

interface Options {
	maxRequestPerSecond?: number
	logging?: boolean
	root?: string
	timeout?: number
}

export class API {
	private _UID: string
	private _secret: string
	private _limiter: RequestLimiter
	private _logging: boolean
	private _root: string
	private _timeout: number

	private _accessToken: AccessToken | null
	private _accessTokenExpiry: number
	private _startCooldown: number
	private _cooldown: number
	private _cooldownGrowthFactor: number

	constructor(
		clientUID: string,
		clientSecret: string,
		options?: Options
	) {
		this._UID = clientUID
		this._secret = clientSecret
		this._limiter = new RequestLimiter(options?.maxRequestPerSecond ?? 1 / 3)
		this._logging = options?.logging ?? false
		this._root = options?.root ?? 'https://api.intra.42.fr'
		this._timeout = options?.timeout ?? Infinity

		this._accessToken = null
		this._accessTokenExpiry = -1
		this._startCooldown = 1500
		this._cooldown = this._startCooldown
		this._cooldownGrowthFactor = 2
	}

	private _log(...args: any[]) {
		if (this._logging)
			console.log(...args)
	}

	private async _fetch<T>(address: string, opt: RequestInit, isTokenUpdateRequest: boolean, startTime = Date.now()): Promise<Response<T>> {
		if (!isTokenUpdateRequest) {
			await this._updateToken()
			if (!opt.headers)
				opt.headers = {}
			opt.headers['Authorization'] = `Bearer ${this._accessToken!.access_token}`
		}

		this._log(`${new Date().toISOString()} REQUEST ${address}, ${JSON.stringify(opt)}`)

		await this._limiter.limit()
		const controller = new AbortController()
		// @ts-ignore
		opt.signal = controller.signal
		const timeout = setTimeout(() => controller.abort(), this._timeout - (Date.now() - startTime))
		let response: Response
		try {
			response = await fetch(address, opt)
		} catch (err) {
			if (err.name === 'AbortError')
				throw `Request to "${address}" timed out after ${this._timeout} ms`
			throw err
		} finally {
			clearTimeout(timeout)
		}

		if (response.status === 429) {
			const duration = Date.now() - startTime
			if (duration > this._timeout)
				throw `Request to "${address}" response is still 429 (Too Many Requests) after ${duration} ms, limit was ${this._timeout} ms`

			this._log(`${new Date().toISOString()} [fetch error]: status: ${response?.status} body: ${JSON.stringify(response)} retrying in ${this._cooldown / 1000} seconds`)
			await new Promise(resolve => setTimeout(resolve, this._cooldown))
			this._cooldown *= this._cooldownGrowthFactor
			return await this._fetch(address, opt, isTokenUpdateRequest, startTime)
		}
		this._cooldown = this._startCooldown
		try {
			const json = await response.json() as T
			return { ok: true, status: response.status, json }
		} catch (err) {
			return { ok: response.ok, status: response.status }
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
		this._log(`[new token]: expires in ${this._accessToken!.expires_in} seconds, on ${new Date(this._accessTokenExpiry).toISOString()}`)
	}

	async get<T>(path: string): Promise<Response<T>> {
		return await this._fetch(`${this._root}${path}`, {}, false)
	}

	async post<T>(path: string, body: Object): Promise<Response<T>> {
		const opt = {
			headers: {
				'Content-Type': 'application/json',
			},
			method: 'POST',
			body: JSON.stringify(body)
		}
		return await this._fetch(`${this._root}${path}`, opt, false)
	}

	async patch<T>(path: string, body: Object): Promise<Response<T>> {
		const opt = {
			headers: {
				'Content-Type': 'application/json',
			},
			method: 'PATCH',
			body: JSON.stringify(body)
		}
		return await this._fetch(`${this._root}${path}`, opt, false)
	}

	async put<T>(path: string, body: Object): Promise<Response<T>> {
		const opt = {
			headers: {
				'Content-Type': 'application/json',
			},
			method: 'PUT',
			body: JSON.stringify(body)
		}
		return await this._fetch(`${this._root}${path}`, opt, false)
	}

	async delete<T>(path: string): Promise<Response<T>> {
		const opt = {
			method: 'DELETE',
		}
		return await this._fetch(`${this._root}${path}`, opt, false)
	}

	async getPaged<T extends { length: number }>(path: string, onPage?: (response: Response<T>) => void): Promise<Response<T[]>> {
		let items: T[] = []

		const address = `${this._root}${path}`
		for (let i = 1; ; i++) {
			const addressI = urlParameterAppend(address, { 'page[number]': i })
			const response = await this._fetch<T>(addressI, {}, false)
			if (!response.ok)
				return { ok: false, status: response.status, json: items }
			if (!response.json)
				break
			if (response.json.length === 0)
				break
			if (onPage)
				onPage(response)
			items = items.concat(response.json)
		}
		return { ok: false, json: items }
	}
}
