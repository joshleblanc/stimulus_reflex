import { Controller } from 'stimulus'
import CableReady from 'cable_ready'
import { defaultSchema } from './schema'
import { getConsumer } from './consumer'
import { dispatchLifecycleEvent } from './lifecycle'
import { allReflexControllers } from './controllers'
import { uuidv4, debounce, emitEvent, serializeForm } from './utils'
import Log from './log'
import {
  attributeValue,
  attributeValues,
  extractElementAttributes,
  extractElementDataset,
  findElement
} from './attributes'
import { extractReflexName, elementToxPath, xPathToElement } from './utils'

// A lambda that does nothing. Very zen; we are made of stars
const NOOP = () => {}

// A reference to the Stimulus application registered with: StimulusReflex.initialize
let stimulusApplication

// A reference to the ActionCable consumer registered with: StimulusReflex.initialize or getConsumer
let actionCableConsumer

// A reference to an optional object called params defined in the StimulusReflex.initialize and passed to channels
let actionCableParams

// Flag which will be false if the server does not accept the channel subscription
let actionCableSubscriptionActive = false

// A dictionary of all active Reflex operations, indexed by reflexId
window.reflexes = {}

// Indicates if we should log calls to stimulate, etc...
let debugging

// Should Reflex playback be restricted to the tab that called it?
let isolationMode

// Subscribes a StimulusReflex controller to an ActionCable channel.
// controller - the StimulusReflex controller to subscribe
//
const createSubscription = controller => {
  actionCableConsumer = actionCableConsumer || getConsumer()
  const { channel } = controller.StimulusReflex
  const subscription = { channel, ...actionCableParams }
  const identifier = JSON.stringify(subscription)

  controller.StimulusReflex.subscription =
    actionCableConsumer.subscriptions.findAll(identifier)[0] ||
    actionCableConsumer.subscriptions.create(subscription, {
      received: data => {
        if (!data.cableReady) return

        if (data.operations['dispatchEvent'])
          return CableReady.perform(data.operations)

        let totalOperations = 0
        let reflexData
        ;['morph', 'innerHtml'].forEach(operation => {
          if (data.operations[operation] && data.operations[operation].length) {
            if (data.operations[operation][0].stimulusReflex) {
              const urls = Array.from(
                new Set(
                  data.operations[operation].map(m => m.stimulusReflex.url)
                )
              )
              if (urls.length !== 1 || urls[0] !== location.href) return

              totalOperations++

              if (!reflexData)
                reflexData = data.operations[operation][0].stimulusReflex
            }
          }
        })

        const { reflexId } = reflexData

        if (!reflexes[reflexId] && !isolationMode) {
          const element = xPathToElement(reflexData.xpath)
          const controllerElement = xPathToElement(reflexData.cXpath)
          element.reflexController = stimulusApplication.getControllerForElementAndIdentifier(
            controllerElement,
            reflexData.reflexController
          )
          element.reflexData = reflexData
          dispatchLifecycleEvent('before', element, reflexId)
          registerReflex(reflexData)
        }

        if (reflexes[reflexId]) {
          reflexes[reflexId].totalOperations = totalOperations
          reflexes[reflexId].pendingOperations = 0
          reflexes[reflexId].completedOperations = 0
          CableReady.perform(data.operations)
        }
      },
      connected: () => {
        actionCableSubscriptionActive = true
        emitEvent('stimulus-reflex:connected')
      },
      rejected: () => {
        actionCableSubscriptionActive = false
        emitEvent('stimulus-reflex:rejected')
        if (debugging) console.warn('Channel subscription was rejected.')
      },
      disconnected: willAttemptReconnect => {
        actionCableSubscriptionActive = false
        emitEvent('stimulus-reflex:disconnected', willAttemptReconnect)
      }
    })
}

// Extends a regular Stimulus controller with StimulusReflex behavior.
//
// Methods added to the Stimulus controller:
// - stimulate
// - __perform
//
const extendStimulusController = controller => {
  Object.assign(controller, {
    // Indicates if the ActionCable web socket connection is open.
    // The connection must be open before calling stimulate.
    //
    isActionCableConnectionOpen () {
      return this.StimulusReflex.subscription.consumer.connection.isOpen()
    },

    // Invokes a server side reflex method.
    //
    // - target - the reflex target (full name of the server side reflex) i.e. 'ReflexClassName#method'
    // - element - [optional] the element that triggered the reflex, defaults to this.element
    // - options - [optional] an object that contains at least one of attrs, reflexId, selectors, resolveLate, serializeForm
    // - *args - remaining arguments are forwarded to the server side reflex method
    //
    stimulate () {
      const url = location.href
      const args = Array.from(arguments)
      const target = args.shift() || 'StimulusReflex::Reflex#default_reflex'
      const element =
        args[0] && args[0].nodeType === Node.ELEMENT_NODE
          ? args.shift()
          : this.element
      if (
        element.type === 'number' &&
        element.validity &&
        element.validity.badInput
      ) {
        if (debugging) console.warn('Reflex aborted: invalid numeric input')
        return
      }
      const options = {}
      if (
        args[0] &&
        typeof args[0] == 'object' &&
        Object.keys(args[0]).filter(key =>
          [
            'attrs',
            'selectors',
            'reflexId',
            'resolveLate',
            'serializeForm'
          ].includes(key)
        ).length
      ) {
        const opts = args.shift()
        Object.keys(opts).forEach(o => (options[o] = opts[o]))
      }
      const attrs = options['attrs'] || extractElementAttributes(element)
      const reflexId = options['reflexId'] || uuidv4()
      let selectors = options['selectors'] || getReflexRoots(element)
      if (typeof selectors == 'string') selectors = [selectors]
      const resolveLate = options['resolveLate'] || false
      const datasetAttribute = stimulusApplication.schema.reflexDatasetAttribute
      const dataset = extractElementDataset(element, datasetAttribute)
      let xpath = elementToxPath(element)
      xpath = xpath.startsWith('//*') ? xpath : '/html/' + xpath
      let cXpath = elementToxPath(this.element)
      cXpath = cXpath.startsWith('//*') ? cXpath : '/html/' + cXpath
      const data = {
        target,
        args,
        url,
        attrs,
        dataset,
        selectors,
        reflexId,
        resolveLate,
        xpath,
        cXpath,
        reflexController: this.identifier,
        permanentAttributeName:
          stimulusApplication.schema.reflexPermanentAttribute
      }
      const { subscription } = this.StimulusReflex

      if (!this.isActionCableConnectionOpen())
        throw 'The ActionCable connection is not open! `this.isActionCableConnectionOpen()` must return true before calling `this.stimulate()`'

      if (!actionCableSubscriptionActive)
        throw 'The ActionCable channel subscription for StimulusReflex was rejected.'

      // lifecycle setup
      element.reflexController = this
      element.reflexData = data

      dispatchLifecycleEvent('before', element, reflexId)

      setTimeout(() => {
        const { params } = element.reflexData || {}
        const formData =
          options['serializeForm'] == false
            ? ''
            : serializeForm(element.closest('form'), { element })

        element.reflexData = {
          ...data,
          params,
          formData
        }

        subscription.send(element.reflexData)
      })

      const promise = registerReflex(data)

      if (debugging) {
        Log.request(
          reflexId,
          target,
          args,
          this.context.scope.identifier,
          element
        )
      }

      return promise
    },

    // Wraps the call to stimulate for any data-reflex elements.
    // This is internal and should not be invoked directly.
    __perform (event) {
      let element = event.target
      let reflex

      while (element && !reflex) {
        reflex = element.getAttribute(
          stimulusApplication.schema.reflexAttribute
        )
        if (!reflex || !reflex.trim().length) element = element.parentElement
      }

      const match = attributeValues(reflex).find(
        reflex => reflex.split('->')[0] === event.type
      )

      if (match) {
        event.preventDefault()
        event.stopPropagation()
        this.stimulate(match.split('->')[1], element)
      }
    }
  })
}

const registerReflex = data => {
  const { reflexId } = data
  reflexes[reflexId] = { finalStage: 'finalize' }

  const promise = new Promise((resolve, reject) => {
    reflexes[reflexId].promise = {
      resolve,
      reject,
      data
    }
  })

  promise.reflexId = reflexId

  if (debugging) promise.catch(NOOP)

  return promise
}

// Registers a Stimulus controller and extends it with StimulusReflex behavior
//
// controller - the Stimulus controller
// options - [optional] configuration
//
const register = (controller, options = {}) => {
  const channel = 'StimulusReflex::Channel'
  controller.StimulusReflex = { ...options, channel }
  createSubscription(controller)
  extendStimulusController(controller)
}

// Default StimulusReflexController that is implicitly wired up as data-controller for any DOM elements
// that have configured data-reflex. Note that this default can be overridden when initializing the application.
// i.e. StimulusReflex.initialize(myStimulusApplication, MyCustomDefaultController);
//
class StimulusReflexController extends Controller {
  constructor (...args) {
    super(...args)
    register(this)
  }
}

// Sets up declarative reflex behavior.
// Any elements that define data-reflex will automatically be wired up with the default StimulusReflexController.
//
const setupDeclarativeReflexes = debounce(() => {
  document
    .querySelectorAll(`[${stimulusApplication.schema.reflexAttribute}]`)
    .forEach(element => {
      const controllers = attributeValues(
        element.getAttribute(stimulusApplication.schema.controllerAttribute)
      )
      const reflexAttributeNames = attributeValues(
        element.getAttribute(stimulusApplication.schema.reflexAttribute)
      )
      const actions = attributeValues(
        element.getAttribute(stimulusApplication.schema.actionAttribute)
      )
      reflexAttributeNames.forEach(reflexName => {
        const controller = findControllerByReflexName(
          reflexName,
          allReflexControllers(stimulusApplication, element)
        )
        let action
        if (controller) {
          action = `${reflexName.split('->')[0]}->${
            controller.identifier
          }#__perform`
          if (!actions.includes(action)) actions.push(action)
        } else {
          action = `${reflexName.split('->')[0]}->stimulus-reflex#__perform`
          if (!controllers.includes('stimulus-reflex')) {
            controllers.push('stimulus-reflex')
          }
          if (!actions.includes(action)) actions.push(action)
        }
      })
      const controllerValue = attributeValue(controllers)
      const actionValue = attributeValue(actions)
      if (
        controllerValue &&
        element.getAttribute(stimulusApplication.schema.controllerAttribute) !=
          controllerValue
      ) {
        element.setAttribute(
          stimulusApplication.schema.controllerAttribute,
          controllerValue
        )
      }
      if (
        actionValue &&
        element.getAttribute(stimulusApplication.schema.actionAttribute) !=
          actionValue
      )
        element.setAttribute(
          stimulusApplication.schema.actionAttribute,
          actionValue
        )
    })
  emitEvent('stimulus-reflex:ready')
}, 20)

// Given a reflex string such as 'click->TestReflex#create' and a list of
// controllers. It will find the matching controller based on the controller's
// identifier. e.g. Given these controller identifiers ['foo', 'bar', 'test'],
// it would select the 'test' controller.
const findControllerByReflexName = (reflexName, controllers) => {
  const controller = controllers.find(controller => {
    if (!controller.identifier) return

    return (
      extractReflexName(reflexName).toLowerCase() ===
      controller.identifier.toLowerCase()
    )
  })

  return controller || controllers[0]
}

// compute the DOM element(s) which will be the morph root
// use the data-reflex-root attribute on the reflex or the controller
// optional value is a CSS selector(s); comma-separated list
// order of preference is data-reflex, data-controller, document body (default)
const getReflexRoots = element => {
  let list = []
  while (list.length === 0 && element) {
    const reflexRoot = element.getAttribute(
      stimulusApplication.schema.reflexRootAttribute
    )
    if (reflexRoot) {
      if (reflexRoot.length === 0 && element.id) reflexRoot = `#${element.id}`
      const selectors = reflexRoot.split(',').filter(s => s.trim().length)
      if (selectors.length === 0) {
        console.error(
          `No value found for ${stimulusApplication.schema.reflexRootAttribute}. Add an #id to the element or provide a value for ${stimulusApplication.schema.reflexRootAttribute}.`,
          element
        )
      }
      list = list.concat(selectors.filter(s => document.querySelector(s)))
    }
    element = element.parentElement
      ? element.parentElement.closest(
          `[${stimulusApplication.schema.reflexRootAttribute}]`
        )
      : null
  }
  return list
}

// Initializes StimulusReflex by registering the default Stimulus controller with the passed Stimulus application.
//
// - application - the Stimulus application
// - options
//   * controller - [optional] the default StimulusReflexController
//   * consumer - [optional] the ActionCable consumer
//   * debug - [false] log all Reflexes to the console
//   * params - [{}] key/value parameters to send during channel subscription
//   * isolate - [false] restrict Reflex playback to the tab which initiated it
//
const initialize = (application, initializeOptions = {}) => {
  const { controller, consumer, debug, params, isolate } = initializeOptions
  actionCableConsumer = consumer
  actionCableParams = params
  isolationMode = !!isolate
  stimulusApplication = application
  stimulusApplication.schema = { ...defaultSchema, ...application.schema }
  stimulusApplication.register(
    'stimulus-reflex',
    controller || StimulusReflexController
  )
  debugging = !!debug
}

if (!document.stimulusReflexInitialized) {
  document.stimulusReflexInitialized = true

  window.addEventListener('load', () => {
    setupDeclarativeReflexes()
    const observer = new MutationObserver(setupDeclarativeReflexes)
    observer.observe(document.documentElement, {
      attributes: true,
      childList: true,
      subtree: true
    })
  })

  const beforeDOMUpdate = event => {
    const { stimulusReflex } = event.detail || {}
    if (!stimulusReflex) return
    const { reflexId, attrs } = stimulusReflex
    const element = findElement(attrs)
    const reflex = reflexes[reflexId]
    const promise = reflex.promise

    reflex.pendingOperations++

    if (reflex.pendingOperations < reflex.totalOperations) return

    if (!stimulusReflex.resolveLate)
      setTimeout(() => promise.resolve({ element, event, data: promise.data }))

    setTimeout(() => dispatchLifecycleEvent('success', element, reflexId))
  }

  document.addEventListener('cable-ready:before-inner-html', beforeDOMUpdate)
  document.addEventListener('cable-ready:before-morph', beforeDOMUpdate)

  const afterDOMUpdate = event => {
    const { stimulusReflex } = event.detail || {}
    if (!stimulusReflex) return
    const { reflexId, attrs } = stimulusReflex
    const element = findElement(attrs)
    const reflex = reflexes[reflexId]
    const promise = reflex.promise

    reflex.completedOperations++

    if (debugging) Log.success(event)

    if (reflex.completedOperations < reflex.totalOperations) return

    if (stimulusReflex.resolveLate)
      setTimeout(() => promise.resolve({ element, event, data: promise.data }))

    setTimeout(() => dispatchLifecycleEvent('finalize', element, reflexId))
  }

  document.addEventListener('cable-ready:after-inner-html', afterDOMUpdate)
  document.addEventListener('cable-ready:after-morph', afterDOMUpdate)

  document.addEventListener('stimulus-reflex:server-message', event => {
    const { reflexId, attrs, serverMessage } = event.detail.stimulusReflex || {}
    const { subject, body } = serverMessage
    const element = findElement(attrs)
    const promise = reflexes[reflexId].promise
    const subjects = { error: true, halted: true, nothing: true, success: true }

    if (element && subject == 'error') element.reflexError = body

    promise[subject == 'error' ? 'reject' : 'resolve']({
      data: promise.data,
      element,
      event,
      toString: () => body
    })

    reflexes[reflexId].finalStage = subject == 'halted' ? 'halted' : 'after'

    if (debugging) Log[subject == 'error' ? 'error' : 'success'](event)

    if (element && subjects[subject])
      dispatchLifecycleEvent(subject, element, reflexId)
  })
}

export default {
  initialize,
  register,
  get debug () {
    return debugging
  },
  set debug (value) {
    debugging = !!value
  }
}
