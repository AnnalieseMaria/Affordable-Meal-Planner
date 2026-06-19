import './style.css'

const appElement = document.querySelector<HTMLElement>('#app');

if (!appElement) {
	throw new Error("Couldn't find element with id 'app'");
}

appElement.innerHTML = `
<h1>Affordable Meal Planner</h1>
</p>Hello from TypeScript!</p>
`
// insert CRUD logic here 