// MVP, delete with PM-41067
//
// Wicket: real macOS implementation for the Quick Access autofill feature.
// Upstream ships this file as a todo!() stub.

use std::time::Duration;

use anyhow::{anyhow, Result};
use core_foundation::{
    base::TCFType, boolean::CFBoolean, dictionary::CFDictionary, string::CFString,
};
use core_graphics::{
    event::{CGEvent, CGEventTapLocation, CGKeyCode},
    event_source::{CGEventSource, CGEventSourceStateID},
};

/// UTF-16 code unit for the tab character, used as the field separator by callers.
const TAB_CHAR: u16 = 0x09;
/// macOS virtual keycode for the Tab key.
const TAB_KEYCODE: CGKeyCode = 0x30;
/// Settle time between posted events; fields need a beat to react.
const EVENT_DELAY: Duration = Duration::from_millis(25);

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    static kAXTrustedCheckOptionPrompt: core_foundation::string::CFStringRef;
    fn AXIsProcessTrustedWithOptions(options: core_foundation::dictionary::CFDictionaryRef)
        -> bool;
}

pub fn get_foreground_window_title() -> Result<String> {
    // Quick Access autofill types on demand and does not match windows, so this
    // stays unimplemented until someone needs it.
    Err(anyhow!(
        "get_foreground_window_title is not implemented on macOS"
    ))
}

fn is_process_trusted(prompt: bool) -> bool {
    let key = unsafe { CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt) };
    let value = if prompt {
        CFBoolean::true_value()
    } else {
        CFBoolean::false_value()
    };
    let options = CFDictionary::from_CFType_pairs(&[(key, value)]);
    unsafe { AXIsProcessTrustedWithOptions(options.as_concrete_TypeRef()) }
}

fn event_source() -> Result<CGEventSource> {
    CGEventSource::new(CGEventSourceStateID::HIDSystemState)
        .map_err(|_| anyhow!("failed to create CGEventSource"))
}

/// CGEventKeyboardSetUnicodeString truncates past 20 UTF-16 units.
const MAX_UNITS_PER_EVENT: usize = 20;

/// Post a text chunk as keyboard events carrying a unicode string. This types
/// arbitrary text without any keycode mapping. Only key-down events are posted:
/// apps read the string from the key-down, and a string-carrying key-up risks
/// double-typing.
fn post_string(utf16: &[u16]) -> Result<()> {
    for chunk in utf16.chunks(MAX_UNITS_PER_EVENT) {
        let event = CGEvent::new_keyboard_event(event_source()?, 0, true)
            .map_err(|_| anyhow!("failed to create keyboard event"))?;
        event.set_string_from_utf16_unchecked(chunk);
        event.post(CGEventTapLocation::HID);
        std::thread::sleep(EVENT_DELAY);
    }
    Ok(())
}

fn post_tab() -> Result<()> {
    for key_down in [true, false] {
        let event = CGEvent::new_keyboard_event(event_source()?, TAB_KEYCODE, key_down)
            .map_err(|_| anyhow!("failed to create tab event"))?;
        event.post(CGEventTapLocation::HID);
        std::thread::sleep(EVENT_DELAY);
    }
    Ok(())
}

pub fn type_input(input: &[u16], _keyboard_shortcut: &[String]) -> Result<()> {
    // Posting CGEvents into other apps requires Accessibility trust. On the first
    // untrusted attempt, trigger the one-time system prompt and fail loudly so
    // the UI can guide the user to System Settings.
    if !is_process_trusted(false) {
        let _ = is_process_trusted(true);
        return Err(anyhow!(
            "macOS Accessibility permission is required to autofill into other apps"
        ));
    }

    let mut chunk: Vec<u16> = Vec::with_capacity(input.len());
    for &c in input {
        if c == TAB_CHAR {
            post_string(&chunk)?;
            chunk.clear();
            post_tab()?;
        } else {
            chunk.push(c);
        }
    }
    post_string(&chunk)?;

    Ok(())
}
