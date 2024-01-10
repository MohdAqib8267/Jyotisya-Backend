# !/bin/bash

no_of_pages_from_first_pdf="$1"
inp_file_name="$2"
append_file_name="$3"
tmp_file_name="$4"
second_file_name="$5"


qpdf "$inp_file_name" --pages . 1-"$no_of_pages_from_first_pdf" -- "$tmp_file_name"

qpdf "$tmp_file_name" --pages "$tmp_file_name" "$append_file_name"  -- --replace-input;
gs -sDEVICE=pdfwrite -dCompatibilityLevel=1.5 -dPDFSETTINGS=/prepress -dNOPAUSE -dQUIET -dBATCH -sOutputFile="$second_file_name" "$tmp_file_name"