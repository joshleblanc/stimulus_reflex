---
description: "Reflex classes are full of Reflex actions. Reflex actions? Full of love. \U0001F3E9"
---

# Reflexes

What is a Reflex, really? Is it a transactional UI update that takes place over a persistent open connection to the server? Is it a new tool on your belt that operates adjacent to and in tandem with concepts like REST and Ajax? Is it the smug feelings associated with successfully achieving a massive productivity arbitrage? Is it the boundless potential for unironic good in every child?

A thousand times, _yes_.

## Glossary

* StimulusReflex: the name of this project, which has a JS client and a Ruby based server component that rides along on top of Rails' ActionCable websockets framework
* Stimulus: an incredibly simple yet powerful JS framework by the creators of Rails
* "a Reflex": used to describe the full, round-trip life-cycle of a StimulusReflex operation, from client to server and back again
* Reflex class: a Ruby class that inherits from `StimulusReflex::Reflex` and lives in your `app/reflexes` folder. This is where your Reflex actions are implemented
* Reflex action: a method in a Reflex class, called in response to activity in the browser. It has access to several special accessors containing all of the Reflex controller element's attributes
* Reflex controller: a Stimulus controller that imports the StimulusReflex client library. It has a `stimulate` method for triggering Reflexes and like all Stimulus controllers, it's aware of the element it is attached to - as well as any Stimulus [targets](https://stimulusjs.org/reference/targets) in its DOM hierarchy
* Reflex controller element: the DOM element upon which the `data-reflex` attribute is placed, which often has data attributes intended to be delivered to the server during a Reflex action
* Morph Modes: the three ways to use StimulusReflex are Page, Selector and Nothing morphs. Page morphs are the default, and covered extensively on this page. See the [Morph Modes](https://docs.stimulusreflex.com/morph-modes) page for more

#### Looking for the way to update just sections of the DOM?

{% page-ref page="morph-modes.md" %}

## What's the deal with CableReady?

[CableReady](https://cableready.stimulusreflex.com/) is the primary dependency of StimulusReflex, and it actually pre-dates this library by a year. What is it, and why should you care enough to watch [this video](https://gorails.com/episodes/how-to-use-cable-ready?autoplay=1&ck_subscriber_id=646293602)?

| Library | Responsibility |
| :--- | :--- |
| StimulusReflex | Translates user actions into server-side events that change your data, then regenerating your page based on this new data **into an HTML string**. |
| CableReady | Takes the HTML string from StimulusReflex and sends it to the browser before using [morphdom](https://github.com/patrick-steele-idem/morphdom/) to update only the parts of your DOM that changed. |

⬆️ StimulusReflex is for **sending** commands. 📡  
⬇️ CableReady is for **receiving** updates. 👽

CableReady has more than 15 methods for changing every aspect of your page, and you can define your own if we missed something. It can emit events, set cookies, make you breakfast and call your parents \(Twilio fees are not included.\)

{% embed url="https://www.youtube.com/watch?v=dPzv2qsj5L8" caption="" %}

## Declaring a Reflex in HTML with data attributes

It is frequently fastest to enable Reflex actions by using the `data-reflex` attribute. The syntax follows Stimulus format: `[DOM-event]->[ReflexClass]#[action]`

```markup
<button data-reflex="click->Comment#create">Create</button>
```

{% hint style="success" %}
The syntax for `data-reflex` was recently loosened; you can now safely omit the string fragment "Reflex" from the Reflex class identifier.

Previously: &lt;div data-reflex="click-&gt;UserReflex\#poke"&gt;  
Now: &lt;div data-reflex="click-&gt;User\#poke"&gt;

Server-side Reflex classes still follow the UserReflex / user\_reflex.rb naming.
{% endhint %}

You can use additional data attributes to pass variables as part of your Reflex payload.

```markup
<button 
  data-reflex="click->Comment#create" 
  data-post-id="<%= @post.id %>"
>Create</button>
```

{% hint style="warning" %}
One important thing to keep in mind is that after a Reflex operation morphs your page, all of your DOM elements are new. It's a **recommended best practice** to put an `id` attribute on any element that has a `data-reflex` attribute on it. If no `id` is available, make sure that there is something unique and identifying about each element which calls a Reflex, even if you resort to something like `data-key="<%= rand %>"`.

If you have multiple identical elements calling Reflex actions, no lifecycle mechanisms \(afterReflex callbacks, success events etc\) will be run.
{% endhint %}

{% hint style="info" %}
Thanks to the magic of [MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver), a browser feature that allows StimulusReflex to know when the DOM has changed, StimulusReflex can pick up `data-reflex` attributes on all HTML elements - even if they are dynamically created and inserted into your DOM.

This means that if you parse a client-side markup format that has declarative Reflexes contained within, they will be connected to StimulusReflex in less than a millisecond.
{% endhint %}

### Declaring multiple Reflex events on an element

Do you want to trigger different Reflex actions for different events? We have you covered!

You can specify multiple Reflex operations by separating them with a space:

```markup
<img src="cat.jpg" data-reflex="mouseenter->Cat#approach mouseleave->Cat#escape">
```

{% hint style="warning" %}
There are two intentional limitations to this technique:

All Reflex actions must target the same controller. In the above example, it won't work properly if the `mouseleave` points to `Dog#escape` because, obviously, cats and dogs don't mix.

Also, you can only specify one action per event; this means `data-reflex="click->Cat#eat click->Cat#sleep"` will not work. In this example, the second action would be discarded.
{% endhint %}

### Inheriting data-attributes from parent elements

You might design your interface such that you have a deeply nested structure of data attributes on parent elements. Instead of writing code to travel your DOM and access those values, you can use the `data-reflex-dataset="combined"` directive to scoop all data attributes up the hierarchy and pass them as part of the Reflex payload.

```markup
<div data-post-id="<%= @post.id %>">
  <div data-category-id="<%= @category.id %>">
    <button data-reflex="click->Comment#create" data-reflex-dataset="combined">Create</button>
  </div>
</div>
```

This Reflex action will have `post-id` and `category-id` accessible:

```ruby
class CommentReflex < ApplicationReflex
  def create
    puts element.dataset["post-id"]
    puts element.dataset["category-id"]
  end
end
```

If a data attribute appears several times, the deepest one in the DOM tree is taken. In the following example, `data-id` would be **2**.

```markup
<div data-id="1">
  <button data-id="2" data-reflex="Example#whatever" data-reflex-dataset="combined">Click me</button>
</div>
```

## Calling a Reflex in a Stimulus controller

Behind the scenes, when you use declarative Reflex calls via `data-reflex` attributes in your HTML, the `stimulate` method on your Stimulus controller is being called. We touched on this briefly in the **Quick Start** chapter; here are the details.

All Stimulus controllers that have had `StimulusReflex.register(this)` called in their `connect` method gain a `stimulate` method.

```javascript
this.stimulate(string target, [DOMElement element], [Object options], ...[JSONObject argument])
```

**target** \[required\] \(exception: see "Requesting a Refresh" below\): a string containing the server Reflex class and method, in the form "Example\#increment".

**element** \[optional\]: a reference to a DOM element which will provide both attributes and scoping selectors. Frequently pointed to `event.target` in JavaScript. **Defaults to the DOM element of the controller in scope**.

**options** \[optional\]: an optional object containing _at least one of_ **reflexId**_**,**_ **selectors** or **attrs**. Can be used to override the ID of a given Reflex or override the selector\(s\) to be used for Page or Selector morphs. Advanced users might wish to modify the attributes sent to the server for the current Reflex.

**argument** \[optional\]: a **splat** of JSON-compliant JavaScript datatypes - array, object, string, numeric or boolean - will be received by the Reflex action as ordered arguments.

### Receiving arguments

When calling `stimulate()` you have the option to send arguments to the Reflex action method. Options have to be JSON-serializable data types and are received in a predictable order. Objects that are passed as parameters are accessible using both symbol and string keys.

```ruby
class CatReflex < StimulusReflex::Reflex
  def adopt(opinions, legs = 4)
    puts opinions["gender"]
    puts opinions[:gender]
  end
end
```

{% hint style="warning" %}
**Note: the method signature has to match.** If the Reflex action is expecting two arguments and doesn't receive two arguments, it will raise an exception.
{% endhint %}

Note that you can only provide parameters to Reflex actions by calling the `stimulate` method with arguments; there is no equivalent for Reflexes declared with data attributes.

### Combined data attributes with `stimulate()`

`data-reflex-dataset="combined"` also works with the `stimulate()` function:

```markup
<div data-folder-id="<%= folder.id %>" data-controller="folders">
  <button data-action="click->folders#edit" data-reflex-dataset="combined">Edit</button>
</div>
```

By default, `stimulate` treats the DOM element that the controller is placed on as the **element** parameter. Instead, we use `event.target` to make the clicked button element be the source of the Reflex action. All combined data attributes will be picked up, and all callbacks and events will emit from the button.

```javascript
import { Controller } from 'stimulus'
import StimulusReflex from 'stimulus_reflex'

export default class extends ApplicationController {
  connect() {
    StimulusReflex.register(this)
  }

  edit(event) {
    this.stimulate("Folder#edit", event.target)
  }
}
```

### Aborting a Reflex

It is possible that you might want to abort a Reflex and prevent it from executing. For example, the user might not have appropriate permissions to complete an action, or perhaps some other side effect like missing data would cause an exception if the Reflex was allowed to continue.

We'll go into much deeper detail on lifecycle callbacks on the [Lifecycle](https://docs.stimulusreflex.com/lifecycle) page, but for now it is important to know that if there is a `before_reflex` method in your Reflex class, it will be executed before the Reflex action. **If you call `raise :abort` in the `before_reflex` method, the Reflex action will not execute.** Instead, the client will receive a `halted` event and execute the `reflexHalted` callback if it's defined.

{% hint style="warning" %}
Halted Reflexes do not execute afterReflex callbacks on the server or client.
{% endhint %}

### Requesting a "refresh"

If you are building advanced workflows, there are edge cases where you may want to initiate a Reflex action that does nothing but re-render the view template and morph any new changes into the DOM. While this shouldn't be your primary tool, it's possible for your data to be mutated by destructive external side effects. 🧟

```javascript
this.stimulate()
```

Calling `stimulate` with no parameters invokes a special global Reflex that allows you to force a re-render of the current state of your application UI. This is the same thing that the user would see if they hit their browser's Refresh button, except without the painfully slow round-trip cycle.

It's also possible to trigger this global Reflex by passing nothing but a browser event to the `data-reflex` attribute. For example, the following button element will refresh the page content every time the user presses it:

```markup
<button data-reflex="click">Refresh</button>
```

## Reflex Classes

Regardless of whether you use declared Reflexes in your HTML markup or call `stimulate()` directly from inside of a Stimulus controller, StimulusReflex maps your requests to Reflex classes on the server. These classes are found in `app/reflexes` and they inherit from `StimulusReflex::Reflex`.

{% code title="app/reflexes/example\_reflex.rb" %}
```ruby
class ExampleReflex < StimulusReflex::Reflex
end
```
{% endcode %}

Setting a declarative data-reflex="click-&gt;Example\#increment" will call the increment Reflex action in the Example Reflex class, before passing any instance variables along to your controller action and re-rendering your page. You can do anything you like in a Reflex action, including database updates, launching ActiveJobs and even initiating CableReady broadcasts.

{% code title="app/reflexes/example\_reflex.rb" %}
```ruby
class ExampleReflex < StimulusReflex::Reflex
  def increment
    @counter += 1 # @counter will be available inside your controller action
  end
end
```
{% endcode %}

{% hint style="warning" %}
Note that there's no correlation between the Reflex class or Reflex action and the page \(or its controller\) that you're on. Your `users#show` page can call `Example#increment`.
{% endhint %}

It's very common to want to be able to access the current\_user or equivalent accessor inside your Reflex actions. The best way to achieve this is to delegate it from the ActionCable connection.

{% code title="app/reflexes/example\_reflex.rb" %}
```ruby
class ExampleReflex < StimulusReflex::Reflex
  delegate :current_user, to: :connection

  def increment
    current_user.counter.increment!
  end
end
```
{% endcode %}

{% hint style="success" %}
If you change the code in a Reflex class, you have to refresh your web browser to allow ActionCable to reconnect. This will reload the appropriate modules and allow you to see your changes.
{% endhint %}

### Building your Reflex action

The following properties available to the developer inside Reflex actions:

* `connection` - the ActionCable connection
* `channel` - the ActionCable channel
* `request` - an `ActionDispatch::Request` proxy for the socket connection
* `session` - the `ActionDispatch::Session` store for the current visitor
* `url` - the URL of the page that triggered the reflex
* `element` - a Hash like object that represents the HTML element that triggered the reflex
* `params` - an `ActionController::Parameters` of the closest form

{% hint style="danger" %}
`reflex` and `process` are reserved words inside Reflex classes. You cannot create Reflex actions with these names.
{% endhint %}

### `element`

The `element` property contains all of the Stimulus controller's [DOM element attributes](https://developer.mozilla.org/en-US/docs/Web/API/Element/attributes) as well as other properties like `tagName`, `checked` and `value`. In addition, `values` and the `dataset` property reference special collections as described below.

{% hint style="info" %}
**Most values are strings.** The only exceptions are `checked` and `selected` which are booleans.

Elements that support **multiple values** such as `<select multiple>` or a collection of checkboxes with the same `name` will emit an additional **`values` property.** In addition, the `value` property will contain a comma-separated string of the checked options.
{% endhint %}

Here's an example that outlines how you can interact with the `element` property and the `dataset` collection in your Reflex action. You can use the dot notation as well as string and symbol accessors.

{% code title="app/views/examples/show.html.erb" %}
```markup
<checkbox id="example" label="Example" checked
  data-reflex="Example#work" data-value="123" />
```
{% endcode %}

{% code title="app/reflexes/example\_reflex.rb" %}
```ruby
class ExampleReflex < StimulusReflex::Reflex
  def work()

    element.id      # => the HTML element's id in dot notation
    element[:id]    # => the HTML element's id w/ symbol accessor
    element["id"]   # => the HTML element's id w/ string accessor

    element.dataset # => a Hash that represents the HTML element's dataset
    element.values  # => [] only for multiple values

    element["id"]                # => "example"
    element[:tag_name]           # => "CHECKBOX"
    element[:checked]            # => true
    element.label                # => "Example"

    element["data-reflex"]       # => "ExampleReflex#work"
    element.dataset[:reflex]     # => "ExampleReflex#work"

    element.value                # => "123"
    element["data-value"]        # => "123"
    element.dataset[:value]      # => "123"

  end
end
```
{% endcode %}

{% hint style="success" %}
When StimulusReflex is rendering your template, an instance variable named **@stimulus\_reflex** is available to your Rails controller and set to true.

You can use this flag to create branching logic to control how the template might look different if it's a Reflex vs normal page refresh.
{% endhint %}

### Reflex exceptions are rescuable

If you'd like to wire up 3rd-party exception handling services like Sentry or HoneyBadger to your Reflex classes, you can use `rescue_from` to respond to an errors raised.

```ruby
class MyTestReflex < StimulusReflex::Reflex
  rescue_from StandardError do |exception|
    ExceptionTrackingService.error(exception)
  end
  # ...
end
```

### Form parameters

If the Reflex element is contained inside of a form element, `params` serializes the values of all input elements as an instance of `ActionController::Parameters`

You can access `params` directly in your Reflex action method and use it exactly as you do in a normal Rails controller. This is useful for model validations and setting multiple attributes of a model at the same time, even if it hasn't yet been saved to the datastore.

You can modify `params` in your `beforeReflex` callback using `element.reflexData`

```javascript
export default class extends ApplicationController {
  beforeReflex(element) {
    const { params } = element.reflexData
    element.reflexData.params = { ...params, foo: true, bar: false }
  }
}
```

Or, if you prefer working with events:

```javascript
document.addEventListener('stimulus-reflex:before', event => {
  const { params } = event.target.reflexData
  event.target.reflexData.params = { ...params, foo: true, bar: false }
})
```

You can find a full example of form submission via Reflex on the Working With HTML Forms page.

{% page-ref page="working-with-forms.md" %}

