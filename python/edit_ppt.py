from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
import sys
import os

ppt_path = sys.argv[1]          # Path to uploaded PPT
name_to_add = sys.argv[2]       # Name to add
save_as_new = sys.argv[3].lower() == "true"  # Save as new file if true

if not os.path.exists(ppt_path):
    print("File not found")
    sys.exit(1)

prs = Presentation(ppt_path)
slide = prs.slides[0]

existing_text = []
for shape in slide.shapes:
    if shape.has_text_frame:
        existing_text.append(shape.text.strip())

if name_to_add not in existing_text:
    # Slide dimensions
    slide_width = prs.slide_width
    slide_height = prs.slide_height

    # Textbox size
    textbox_width = Inches(4)
    textbox_height = Inches(0.5)

    # Place textbox at bottom-left
    left = Inches(1.5)  # 0.5 inch from left
    top = slide_height - textbox_height - Inches(4.0)  # 0.5 inch from bottom

    textbox = slide.shapes.add_textbox(left, top, textbox_width, textbox_height)
    textbox.text = name_to_add

    # Format font size and color
    for paragraph in textbox.text_frame.paragraphs:
        for run in paragraph.runs:
            run.font.size = Pt(24)
            run.font.color.rgb = RGBColor(255, 255, 255)  # White color

    print(f"Added name at bottom-left in white: {name_to_add}")
else:
    print(f"Name already exists: {name_to_add}")

if save_as_new:
    new_file = os.path.splitext(ppt_path)[0] + "_updated.pptx"
    prs.save(new_file)
    print(f"Saved as new file: {new_file}")
else:
    prs.save(ppt_path)
    print(f"Saved updated file: {ppt_path}")
