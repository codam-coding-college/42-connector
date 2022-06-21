# 42-connector
This Node module interfaces with the 42 API --> https://api.intra.42.fr

## Usage
### Installation
`npm i --save https://github.com/codam-coding-college/42-connector.git`

### Code example
```typescript
import { API } from '42-connector'

const api = new API(clientUID, clientSecret, maxRequestPerSecond, logging, root)

const achievements: Response = await api.get('/v2/achievements')
console.log(achievements.json)

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