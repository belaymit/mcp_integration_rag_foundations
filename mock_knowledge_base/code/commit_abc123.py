def apply_mobile_styles(button_element, screen_width):
    """Applies mobile styles to button element when screen is narrow"""
    if screen_width < 480:
        button_element.style.marginLeft = 'auto'
        button_element.style.marginRight = 'auto'
    # ... other styles would go here