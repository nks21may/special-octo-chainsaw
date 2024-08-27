import { AfterViewInit, ElementRef, EventEmitter, OnDestroy, OnInit } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import * as i0 from "@angular/core";
export interface StickyPositions {
    offsetY: number;
    bottomBoundary: number | null;
    upperScreenEdgeAt?: number;
    marginTop?: number;
    marginBottom?: number;
}
export interface StickyStatus {
    isSticky: boolean;
    reachedUpperEdge: boolean;
    reachedLowerEdge: boolean;
    marginTop?: number;
    marginBottom?: number;
}
export declare class StickyThingDirective implements OnInit, AfterViewInit, OnDestroy {
    private stickyElement;
    private platformId;
    filterGate: boolean;
    marginTop$: BehaviorSubject<number>;
    marginBottom$: BehaviorSubject<number>;
    enable$: BehaviorSubject<boolean>;
    scrollContainer: string | HTMLElement | undefined;
    auditTime: number;
    set marginTop(value: number);
    set marginBottom(value: number);
    set enable(value: boolean);
    spacerElement: HTMLElement | undefined;
    boundaryElement: HTMLElement | undefined;
    sticky: boolean;
    isSticky: boolean;
    boundaryReached: boolean;
    upperBoundReached: boolean;
    stickyStatus: EventEmitter<StickyStatus>;
    stickyPosition: EventEmitter<StickyPositions>;
    /**
     * The field represents some position values in normal (not sticky) mode.
     * If the browser size or the content of the page changes, this value must be recalculated.
     * */
    private scroll$;
    private scrollThrottled$;
    private target;
    private resize$;
    private resizeThrottled$;
    private extraordinaryChange$;
    private status$;
    private componentDestroyed;
    constructor(stickyElement: ElementRef, platformId: string);
    ngAfterViewInit(): void;
    recalculate(): void;
    /**
     * This is nasty code that should be refactored at some point.
     *
     * The Problem is, we filter for enabled. So that the code doesn't run
     * if @Input enabled = false. But if the user disables, we need exactly 1
     * emit in order to reset and call removeSticky. So this method basically
     * turns the filter in "filter, but let the first pass".
     * */
    checkEnabled(enabled: boolean): boolean;
    onWindowResize(): void;
    setupListener(): void;
    listener: (e: Event) => void;
    ngOnInit(): void;
    ngOnDestroy(): void;
    private getScrollTarget;
    getComputedStyle(el: HTMLElement): ClientRect | DOMRect;
    private determineStatus;
    private getMargins;
    /**
     * Gets the offset for element. If the element
     * currently is sticky, it will get removed
     * to access the original position. Other
     * wise this would just be 0 for fixed elements. */
    private determineElementOffsets;
    private makeSticky;
    private determineBoundaryReached;
    private checkSetup;
    private setSticky;
    private setStatus;
    private removeSticky;
    static ɵfac: i0.ɵɵFactoryDeclaration<StickyThingDirective, never>;
    static ɵdir: i0.ɵɵDirectiveDeclaration<StickyThingDirective, "[stickyThing]", never, { "scrollContainer": "scrollContainer"; "auditTime": "auditTime"; "marginTop": "marginTop"; "marginBottom": "marginBottom"; "enable": "enable"; "spacerElement": "spacer"; "boundaryElement": "boundary"; }, { "stickyStatus": "stickyStatus"; "stickyPosition": "stickyPosition"; }, never, never, false, never>;
}
