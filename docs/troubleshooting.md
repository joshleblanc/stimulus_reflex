# Troubleshooting

![](https://cdn.vox-cdn.com/thumbor/2q97YCXcLOlkoR2jKKEMQ-wkG9k=/0x0:900x500/1200x800/filters:focal%28378x178:522x322%29/cdn.vox-cdn.com/uploads/chorus_image/image/49493993/this-is-fine.0.jpg)

## Verify ActionCable

If ActionCable isn't working properly in your environment, StimulusReflex cannot function.

Step one to any troubleshooting process should be "is it plugged in?"

First, run `rails generate channel test` in your Rails project folder. This will ensure that your ActionCable setup has been initialized, although you should verify that in your `app/javascript/packs/application.js` you have `import 'channels'` present.

Next, **copy and paste** the following into the two specified files, replacing their contents.

{% code title="app/channels/test\_channel.rb" %}
```ruby
class TestChannel < ApplicationCable::Channel
  def subscribed
    stream_from "test"
  end

  def receive(data)
    puts data["message"]
    ActionCable.server.broadcast("test", "ActionCable is connected")
  end
end
```
{% endcode %}

{% code title="app/javascript/channels/test\_channel.js" %}
```javascript
import consumer from './consumer'

consumer.subscriptions.create('TestChannel', {
  connected () {
    this.send({ message: 'Client is live' })
  },

  received (data) {
    console.log(data)
  }
})
```
{% endcode %}

If ActionCable is running properly, you should see `ActionCable is connected` in your browser's Console Inspector and `Client is live` in your server's STDOUT log stream.

You can feel free to remove both of these files after you're done, but leave `app/javascript/channels/consumer.js` where it is so that you can pass it to `StimulusReflex.initialize()` and share one ActionCable connection.

## Logging

### Client-Side

You might want to know the order in which your Reflexes are called, how long it took to process each Reflex or what the Reflex response payload contains. Luckily you can enable Reflex logging to your browser's Console Inspector.

![](.gitbook/assets/screenshot_2020-05-05_at_01.19.44.png)

There are two ways to enable client debugging in your StimulusReflex instance.

You can provide `debug: true` to the initialize options like this:

{% code title="app/javascript/controllers/index.js" %}
```javascript
StimulusReflex.initialize(application, { consumer, debug: true })
```
{% endcode %}

You can also set debug mode after you've initialized StimulusReflex. This is especially useful if you just want to log the Reflex calls in your development environment:

{% code title="app/javascript/controllers/index.js" %}
```javascript
StimulusReflex.initialize(application, { consumer })
StimulusReflex.debug = process.env.RAILS_ENV === 'development'
```
{% endcode %}

### Server-Side

By default, ActionCable emits particularly verbose Rails logger messages. You can **optionally** discard everything but exceptions by switching to the `warn` log level, as is common in development environments:

{% code title="config/environments/development.rb" %}
```ruby
# :debug, :info, :warn, :error, :fatal, :unknown
config.log_level = :warn
```
{% endcode %}

Alternatively, you can disable ActionCable logs at the framework level. This _may_ improve performance, at the cost of not having ActionCable logs when you need them.

{% code title="config/initializers/action\_cable.rb" %}
```ruby
ActionCable.server.config.logger = Logger.new(nil)
```
{% endcode %}

{% hint style="warning" %}
We have received reports that for some developers, silencing their ActionCable logs resulted in a dramatic performance increase. If your Reflex action round-trip times are inexplicably sluggish, please do experiment with disabling logs.

Unfortunately, this is difficult to triage because it has yet to impact the StimulusReflex team members; if you have any insights, don't be shy.
{% endhint %}

## Anti-Patterns

{% hint style="warning" %}
Work in Progress!
{% endhint %}

### \[Don't\] change the URL rendered by a reflex

### \[Don't\] call `stimulate()` in `connect()`

## Modifying the default data attribute schema

If you're stuck working with legacy applications that impose constraints on your data attribute naming scheme, Stimulus and StimulusReflex give you a mechanism to provide an alternative schema.

In addition to **controllerAttribute**, **actionAttribute** and **targetAttribute** as defined by Stimulus, StimulusReflex adds the following: **reflexAttribute**, **reflexPermanentAttribute**, **reflexRootAttribute** and **reflexDatasetAttribute**.

You can update these values by providing your own schema to `Application.start()`

{% code title="app/javascript/controllers/index.js" %}
```javascript
import { Application } from 'stimulus'
import { definitionsFromContext } from 'stimulus/webpack-helpers'
import StimulusReflex from 'stimulus_reflex'
import consumer from '../channels/consumer'

const application = Application.start(document.documentElement, {
  reflexAttribute: 'data-avenger'
})
const context = require.context('controllers', true, /_controller\.js$/)
application.load(definitionsFromContext(context))
StimulusReflex.initialize(application, { consumer })
StimulusReflex.debug = process.env.RAILS_ENV === 'development'
```
{% endcode %}

In the above example, you have now configured your application to parse your DOM for `data-avenger` attributes instead of `data-reflex` attributes. 🦸

## Flight Safety Card

{% hint style="info" %}
If you're making changes to your Reflex classes, remember that you need to refresh your page in your web browser to allow ActionCable to reconnect to the server. You'll still be executing old code until you reconnect.

You can [setup webpack-dev-server to help](https://docs.stimulusreflex.com/patterns#use-webpack-dev-server-to-reload-after-reflex-changes), however.
{% endhint %}

{% hint style="info" %}
If you're collaborating with a team during development, **make sure that they have caching turned on**. They just need to run `rails dev:cache` one time.
{% endhint %}

{% hint style="info" %}
Remember: putting `data-reflex="Foo#action"` on an element does **not** automatically attach an instance of the `foo` controller. If you need `foo` or any other Stimulus controllers on your elements, you have to attach them yourself.
{% endhint %}

{% hint style="info" %}
There's nothing about StimulusReflex 3+ that shouldn't work fine in a Rails 5.2 app if you're willing to do a bit of manual package dependency management.
{% endhint %}

{% hint style="info" %}
Are you finding that the [Trix](https://github.com/basecamp/trix) rich text editor isn't playing nicely with morphs? Our suggestion is to use [Selector Morphs](https://docs.stimulusreflex.com/morph-modes#selector-morphs). If that's not possible, you might need to wrap it with a `data-reflex-permanent` attribute until we figure out what's up.
{% endhint %}

{% hint style="info" %}
Make sure that your [Allowed Request Origins](https://guides.rubyonrails.org/action_cable_overview.html#allowed-request-origins) is properly configured for your environment, or else ActionCable won't be able to connect.
{% endhint %}

{% hint style="info" %}
If your ActionCable is not connecting, make sure that you do not have an overly-restrictive [Content Security Policy](https://content-security-policy.com/connect-src/) in place on your application. You can learn more in [this excellent article](https://bauland42.com/ruby-on-rails-content-security-policy-csp/).
{% endhint %}

{% hint style="info" %}
Working with subdomains? Make sure your application layout view calls `action_cable_meta_tag` in your `HEAD`.
{% endhint %}

{% hint style="info" %}
Are you using [Phusion Passenger](https://www.phusionpassenger.com/) but seeing your server appear to freeze up? Make sure your [configuration](https://docs.stimulusreflex.com/deployment#phusion-passenger) is correct.
{% endhint %}

{% hint style="info" %}
Getting weird Console Inspector errors? Make sure that your `stimulus_reflex` **npm** package version is **identical** to your Ruby **gem** version.
{% endhint %}

{% hint style="info" %}
Do you have your `config/cable.yml` set up properly? We strongly recommend that you [install Redis](http://tutorials.jumpstartlab.com/topics/performance/installing_redis.html) as the adapter in development mode.
{% endhint %}

{% hint style="info" %}
Are you using `ApplicationController.render` to regenerate partials that make use of view helpers? Are those helpers generating URL routes that point to `example.com`? You can fix this by setting up your [default\_url\_options](https://docs.stimulusreflex.com/deployment#set-your-default_url_options-for-each-environment).
{% endhint %}

{% hint style="info" %}
If your `data-reflex-permanent` isn't being respected, try adding a unique `id` parameter as well.
{% endhint %}

{% hint style="info" %}
If you're supporting an older application that is using Webpacker v3, we have had some reports of issues. Is it possible to upgrade to v4?
{% endhint %}

{% hint style="info" %}
If _something_ goes wrong, it's often because of the **spring** gem. 💣👎

You can test this by temporarily setting the `DISABLE_SPRING=1` environment variable and restarting your server.

To remove spring **forever**, here is the process we recommend:

1. `pkill -f spring`
2. Edit your Gemfile and comment out **spring** and **spring-watcher-listen**
3. `bin/spring binstub --remove --all`
{% endhint %}

## Be realistic

We're very proud of StimulusReflex and CableReady, which are both standing on the shoulders of many giants such as Rails, Ruby and Redis.

However, we want to be the first to recognize that there are limitations and constraints you should consider before using these technologies in your applications. After all, Rails itself does not claim to be immune from side effects, though huge amounts of effort are being invested into improving Ruby's concurrency story even while you read this.

There are edge cases where data could become out of date in between the time a Reflex queries the database and the resulting DOM update is applied in the browser. While there are mitigation strategies \(such as tracking versions on everything\) which you could employ, it's important to remember that you could be opening a can of worms that leads to sadness and/or madness.

Please don't use StimulusReflex or CableReady to drive mission-critical and/or life-threatening situations. It is a terrible choice to re-write your laser vision correction servo motor controls with StimulusReflex. Don't pilot drones or operate heavy machinery that is controlled with StimulusReflex.

The only exception to the above is [Guntron](https://pbfcomics.com/comics/guntron/). StimulusReflex is perfect for [Guntron](https://pbfcomics.com/comics/guntron/).

