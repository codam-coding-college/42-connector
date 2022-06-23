# 42-connector
This Node module interfaces with the 42 API --> https://api.intra.42.fr

## Usage
### Installation
`npm i --save https://github.com/codam-coding-college/42-connector.git`
<br>
or if you want a specific version:
<br>
`npm i --save https://github.com/codam-coding-college/42-connector.git#3.0.0`

## Code example
```typescript
import { API } from '42-connector'

const api = new API(clientUID, clientSecret)

const response: Response = await api.get('/v2/achievements')
console.log(response)

const post_response: Response = await api.post('/v2/feedbacks', {
	'feedback[comment]': 'Much good, such wow',
	'feedback[feedback_details_attributes][rate]': 2,
	'feedback[feedback_details_attributes][kind]': 'interesting',
})

const delete_response: Response = await api.delete('/v2/events_users/:id')

const allPages: Response = await api.getPaged('/v2/achievements_users', (singlePage) => {
	console.log(singlePage)
})
```

### Using options
```typescript
import { API } from '42-connector'

const defaultOptions = {
	maxRequestPerSecond: 1 / 3,			// The default unprivileged intra app can do 1200 requests per hour, or 1/3 per second
	logging: false,						// Nice for debugging and logging
	root: 'https://api.intra.42.fr',	// The url with which to prefix every request
	timeout: 2147483647					// Maximum time to wait for intra to give a 2xx response before throwing an error
}
const api = new API(clientUID, clientSecret, defaultOptions)

const response: Response = await api.get('/v2/achievements')
console.log(response)
```